use anyhow::Result;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use ethers_signers::{LocalWallet, Signer};
use rand::Rng;

use crate::PgPool;

/// Generate a random secp256k1 keypair, return (private_key_hex, checksummed_address).
pub fn generate_keypair() -> Result<(String, String)> {
    let mut rng = rand::thread_rng();
    let mut bytes = [0u8; 32];
    rng.fill(&mut bytes);
    let wallet = LocalWallet::from_bytes(&bytes)?;
    let private_key_hex = hex::encode(bytes);
    let address = format!("{:?}", wallet.address());
    Ok((private_key_hex, address))
}

/// Generate a random hex salt for key derivation.
pub fn generate_salt() -> String {
    let mut rng = rand::thread_rng();
    let salt: [u8; 16] = rng.r#gen();
    hex::encode(salt)
}

/// Version byte marking the v1 ciphertext layout used by [`encrypt_key`]:
/// `[0x01][12-byte random nonce][AES-256-GCM ciphertext || 16-byte tag]`.
///
/// Earlier vaults were encrypted without a version byte using a nonce derived
/// deterministically from `salt`. [`decrypt_key`] keeps reading those (the
/// legacy path) so existing stored keypairs remain decryptable, but all *new*
/// encryptions use a fresh random nonce to satisfy AES-GCM's nonce-uniqueness
/// requirement (reusing a key+nonce pair leaks plaintext via keystream reuse).
const CIPHERTEXT_VERSION_V1: u8 = 0x01;

/// AES-256-GCM nonce length in bytes.
const NONCE_LEN: usize = 12;

/// Encrypt a private key hex string with AES-256-GCM.
///
/// `encryption_key` is a hex-encoded 32-byte key. `salt` is retained on the
/// signature only for backward compatibility with the legacy decryption path
/// (see [`decrypt_key`]); it is NOT used to derive the nonce anymore. A fresh
/// cryptographically random 12-byte nonce is generated per call and stored
/// alongside the ciphertext via the [`CIPHERTEXT_VERSION_V1`] framing so the
/// same (key, nonce) pair is never reused across encryptions or key rotation.
pub fn encrypt_key(private_key_hex: &str, encryption_key: &str, _salt: &str) -> Result<Vec<u8>> {
    let key_bytes = hex::decode(encryption_key)?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)?;

    // Generate a fresh random 12-byte nonce per encryption. AES-GCM security
    // depends on nonce uniqueness for a given key; a static salt-derived nonce
    // would be reused on re-encryption / key rotation.
    let mut rng = rand::thread_rng();
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rng.fill(&mut nonce_bytes);

    let ciphertext = cipher
        .encrypt(&Nonce::from_slice(&nonce_bytes), private_key_hex.as_bytes())
        .map_err(|e| anyhow::anyhow!("Encryption failed: {}", e))?;

    // Layout: [version byte][nonce][ciphertext + GCM tag].
    let mut out = Vec::with_capacity(1 + NONCE_LEN + ciphertext.len());
    out.push(CIPHERTEXT_VERSION_V1);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Decrypt a private key back to hex string.
///
/// Supports two ciphertext layouts:
/// 1. **v1** (current): `[0x01][12-byte nonce][ciphertext + tag]` — nonce is
///    embedded, so re-encryption never reuses a nonce.
/// 2. **legacy**: raw AES-256-GCM output with the nonce derived from `salt`.
///    Kept so vaults written before this fix stay decryptable.
pub fn decrypt_key(encrypted: &[u8], encryption_key: &str, salt: &str) -> Result<String> {
    let key_bytes = hex::decode(encryption_key)?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)?;

    // v1 framing: version byte + full nonce + at least the 16-byte GCM tag.
    let is_v1 = encrypted.len() >= 1 + NONCE_LEN + 16
        && encrypted[0] == CIPHERTEXT_VERSION_V1;

    if is_v1 {
        let nonce = &encrypted[1..1 + NONCE_LEN];
        let ciphertext = &encrypted[1 + NONCE_LEN..];
        if let Ok(plaintext) = cipher.decrypt(Nonce::from_slice(nonce), ciphertext) {
            return Ok(String::from_utf8(plaintext)?);
        }
        // A false positive (a legacy ciphertext whose first byte happens to be
        // the version byte) fails the GCM tag check; fall through to the legacy
        // path instead of erroring out.
    }

    // Legacy path: nonce derived deterministically from the salt.
    let salt_bytes = hex::decode(salt)?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    let take = salt_bytes.len().min(NONCE_LEN);
    nonce_bytes[..take].copy_from_slice(&salt_bytes[..take]);

    let plaintext = cipher
        .decrypt(&Nonce::from(nonce_bytes), encrypted)
        .map_err(|e| anyhow::anyhow!("Decryption failed: {}", e))?;

    Ok(String::from_utf8(plaintext)?)
}

/// Persist a vault's encrypted keypair.
pub async fn insert(
    pool: &PgPool,
    vault_id: &str,
    encrypted: &[u8],
    public_address: &str,
    salt: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO vault_keypairs (vault_id, encrypted_private_key, public_address, key_salt)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(vault_id)
    .bind(encrypted)
    .bind(public_address)
    .bind(salt)
    .execute(pool)
    .await?;
    Ok(())
}

/// Get the public address for a vault (no decryption needed).
pub async fn get_address(pool: &PgPool, vault_id: &str) -> Result<Option<String>> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT public_address FROM vault_keypairs WHERE vault_id = $1")
            .bind(vault_id)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|(addr,)| addr))
}

/// Decrypt and return the private key hex for signing.
pub async fn decrypt_for_signing(
    pool: &PgPool,
    vault_id: &str,
    encryption_key: &str,
) -> Result<String> {
    let row: Option<(Vec<u8>, String)> = sqlx::query_as(
        "SELECT encrypted_private_key, key_salt FROM vault_keypairs WHERE vault_id = $1",
    )
    .bind(vault_id)
    .fetch_optional(pool)
    .await?;

    let (encrypted, salt) = row.ok_or_else(|| anyhow::anyhow!("No keypair for vault {}", vault_id))?;
    decrypt_key(&encrypted, encryption_key, &salt)
}
