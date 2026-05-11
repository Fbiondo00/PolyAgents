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

/// Encrypt a private key hex string with AES-256-GCM.
/// `encryption_key` is a hex-encoded 32-byte key.
/// `salt` is used to derive the nonce.
pub fn encrypt_key(private_key_hex: &str, encryption_key: &str, salt: &str) -> Result<Vec<u8>> {
    let key_bytes = hex::decode(encryption_key)?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)?;

    // Derive a 12-byte nonce from the salt
    let salt_bytes = hex::decode(salt)?;
    let mut nonce_bytes = [0u8; 12];
    nonce_bytes.copy_from_slice(&salt_bytes[..12]);

    let ciphertext = cipher
        .encrypt(&Nonce::from(nonce_bytes), private_key_hex.as_bytes())
        .map_err(|e| anyhow::anyhow!("Encryption failed: {}", e))?;

    Ok(ciphertext)
}

/// Decrypt a private key back to hex string.
pub fn decrypt_key(encrypted: &[u8], encryption_key: &str, salt: &str) -> Result<String> {
    let key_bytes = hex::decode(encryption_key)?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)?;

    let salt_bytes = hex::decode(salt)?;
    let mut nonce_bytes = [0u8; 12];
    nonce_bytes.copy_from_slice(&salt_bytes[..12]);

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
