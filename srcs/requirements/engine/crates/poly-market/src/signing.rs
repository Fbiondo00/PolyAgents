use anyhow::Result;
use ethers_core::types::transaction::eip712::EIP712Domain;
use ethers_core::types::{Address, U256};
use ethers_core::utils::keccak256;
use ethers_signers::{LocalWallet, Signer};

use poly_types::config::PolymarketConfig;
use poly_types::order::NewOrder;

const CTF_EXCHANGE_V2: &str = "0xE111180000d2663C0091e4f400237545B87B996B";
const POLYGON_CHAIN_ID: u64 = 137;
const USDC_DECIMALS: u32 = 6;

/// Derive the Ethereum address from a hex private key.
pub fn derive_address(private_key: &str) -> Result<String> {
    let wallet: LocalWallet = private_key.parse()?;
    Ok(format!("{:?}", wallet.address()))
}

/// Build a fully signed V2 order payload ready for POST /order, using an explicit private key.
pub fn build_order_payload_for_key(
    private_key: &str,
    order: &NewOrder,
) -> Result<serde_json::Value> {
    let wallet: LocalWallet = private_key.parse()?;
    let address = wallet.address();

    let side_u8: u8 = match order.side {
        poly_types::market::Side::Buy => 0,
        poly_types::market::Side::Sell => 1,
    };
    let side_str = match order.side {
        poly_types::market::Side::Buy => "BUY",
        poly_types::market::Side::Sell => "SELL",
    };

    let size_units = (order.size * rust_decimal::Decimal::from(10u64.pow(USDC_DECIMALS)))
        .to_string()
        .parse::<u64>()?;
    let notional =
        (order.price * order.size * rust_decimal::Decimal::from(10u64.pow(USDC_DECIMALS)))
            .to_string()
            .parse::<u64>()?;

    let (maker_amount, taker_amount) = (size_units, notional);

    let salt = chrono::Utc::now().timestamp_millis() as u64;
    let timestamp = chrono::Utc::now().timestamp_millis() as u64;
    let token_id_u256: U256 = order.token_id.parse().unwrap_or(U256::zero());
    let zero_bytes32 = format!("0x{}", "0".repeat(64));

    let domain = EIP712Domain {
        name: Some("Polymarket CTF Exchange".into()),
        version: Some("2".into()),
        chain_id: Some(POLYGON_CHAIN_ID.into()),
        verifying_contract: Some(CTF_EXCHANGE_V2.parse::<Address>()?),
        ..Default::default()
    };

    let domain_separator = domain.separator();

    let type_hash: [u8; 32] = [
        0xbb, 0x86, 0x31, 0x8a, 0x21, 0x38, 0xf5, 0xfa, 0x8a, 0xe3, 0x2f, 0xbe, 0x8e, 0x65,
        0x9f, 0x8f, 0xcf, 0x13, 0xcc, 0x6a, 0xe4, 0x01, 0x4a, 0x70, 0x78, 0x93, 0x05, 0x54,
        0x33, 0x81, 0x85, 0x89,
    ];

    let struct_hash = hash_order(&type_hash, &OrderParams {
        salt,
        maker: address,
        token_id: token_id_u256,
        maker_amount,
        taker_amount,
        side: side_u8,
        timestamp,
    });

    let mut prefixed = vec![0x19, 0x01];
    prefixed.extend_from_slice(&domain_separator);
    prefixed.extend_from_slice(&struct_hash);

    let message_hash = keccak256(&prefixed);

    let signature = wallet.sign_hash(message_hash.into())?;
    let sig_bytes: [u8; 65] = Into::<[u8; 65]>::into(&signature);
    let sig_hex = format!("0x{}", hex::encode(sig_bytes));

    Ok(serde_json::json!({
        "order": {
            "salt": salt.to_string(),
            "maker": format!("{:?}", address),
            "signer": format!("{:?}", address),
            "taker": "0x0000000000000000000000000000000000000000",
            "tokenId": token_id_u256.to_string(),
            "makerAmount": maker_amount.to_string(),
            "takerAmount": taker_amount.to_string(),
            "side": side_str,
            "signatureType": 0,
            "expiration": "0",
            "timestamp": timestamp.to_string(),
            "metadata": zero_bytes32,
            "builder": zero_bytes32
        },
        "signature": sig_hex,
        "signatureType": 0
    }))
}

/// Build a signed order payload using the config's private key (backward compat).
pub fn build_order_payload(
    config: &PolymarketConfig,
    order: &NewOrder,
) -> Result<serde_json::Value> {
    build_order_payload_for_key(&config.private_key, order)
}

struct OrderParams {
    salt: u64,
    maker: Address,
    token_id: U256,
    maker_amount: u64,
    taker_amount: u64,
    side: u8,
    timestamp: u64,
}

/// keccak256(typeHash || abiEncode(salt, maker, signer, tokenId, makerAmount, takerAmount, side, signatureType, timestamp, metadata, builder))
fn hash_order(
    type_hash: &[u8; 32],
    params: &OrderParams,
) -> [u8; 32] {
    use ethers_core::abi::{encode, Token};

    let tokens = vec![
        Token::FixedBytes(type_hash.to_vec()),
        Token::Uint(U256::from(params.salt)),
        Token::Address(params.maker),
        Token::Address(params.maker), // signer == maker for EOA
        Token::Uint(params.token_id),
        Token::Uint(U256::from(params.maker_amount)),
        Token::Uint(U256::from(params.taker_amount)),
        Token::Uint(U256::from(params.side)),
        Token::Uint(U256::from(0u8)), // signatureType EOA = 0
        Token::Uint(U256::from(params.timestamp)),
        Token::FixedBytes(vec![0u8; 32]), // metadata
        Token::FixedBytes(vec![0u8; 32]), // builder
    ];

    keccak256(encode(&tokens))
}
