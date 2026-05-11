use anyhow::Result;
use ethers_core::types::{Address, U256};
use ethers_signers::{LocalWallet, Signer};

const USDC_ABI_BALANCE_OF: &str = "0x70a08231";
const USDC_ABI_TRANSFER: &str = "0xa9059cbb";

/// Read USDC balance of `account` on Polygon via `eth_call`.
/// Returns the balance in USDC units (6 decimals) as a string.
pub async fn get_usdc_balance(
    rpc_url: &str,
    usdc_address: &str,
    account: &str,
) -> Result<String> {
    let client = reqwest::Client::new();

    // balanceOf(address) padded to 32 bytes
    let padded_account = format!("{:#>66}", account);
    let data = format!("{}{}", USDC_ABI_BALANCE_OF, &padded_account[2..]);

    let resp: serde_json::Value = client
        .post(rpc_url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "method": "eth_call",
            "params": [
                { "to": usdc_address, "data": data },
                "latest"
            ],
            "id": 1
        }))
        .send()
        .await?
        .json()
        .await?;

    let hex_balance = resp["result"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No balance in RPC response"))?;

    let raw: U256 = hex_balance.parse()?;
    let balance = raw.as_u128() as f64 / 1_000_000.0;

    Ok(format!("{:.6}", balance))
}

/// Transfer USDC from the agent EOA (derived from `private_key`) to `to_address`.
/// Returns the transaction hash.
pub async fn transfer_usdc(
    rpc_url: &str,
    usdc_address: &str,
    private_key: &str,
    to_address: &str,
    amount_usdc: &str,
) -> Result<String> {
    let wallet: LocalWallet = private_key.parse()?;
    let from_address = wallet.address();

    let amount_f: f64 = amount_usdc.parse()?;
    let amount_wei = (amount_f * 1_000_000.0) as u128;

    // transfer(address,uint256)
    let padded_to = format!("{:#>66}", to_address);
    let amount_hex = format!("0x{:064x}", amount_wei);
    let data = format!(
        "{}{}{}",
        USDC_ABI_TRANSFER,
        &padded_to[2..],
        &amount_hex[2..]
    );

    // Get nonce
    let client = reqwest::Client::new();
    let nonce_resp: serde_json::Value = client
        .post(rpc_url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "method": "eth_getTransactionCount",
            "params": [format!("{:?}", from_address), "pending"],
            "id": 1
        }))
        .send()
        .await?
        .json()
        .await?;

    let nonce_str = nonce_resp["result"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No nonce in RPC response"))?;
    let nonce: U256 = nonce_str.parse()?;

    // Get gas price
    let gas_resp: serde_json::Value = client
        .post(rpc_url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "method": "eth_gasPrice",
            "params": [],
            "id": 2
        }))
        .send()
        .await?
        .json()
        .await?;

    let gas_price_str = gas_resp["result"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No gas price in RPC response"))?;
    let gas_price: U256 = gas_price_str.parse()?;

    // Estimate gas
    let gas_estimate_resp: serde_json::Value = client
        .post(rpc_url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "method": "eth_estimateGas",
            "params": [{
                "from": format!("{:?}", from_address),
                "to": usdc_address,
                "data": data,
            }],
            "id": 3
        }))
        .send()
        .await?
        .json()
        .await?;

    let gas_limit_str = gas_estimate_resp["result"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No gas estimate in RPC response"))?;
    let gas_limit: U256 = gas_limit_str.parse()?;

    // Build legacy transaction (ethers v2 TransactionRequest is legacy-style)
    let tx = ethers_core::types::TransactionRequest {
        from: Some(from_address),
        to: Some(ethers_core::types::NameOrAddress::Address(usdc_address.parse::<Address>()?)),
        nonce: Some(nonce),
        gas: Some(gas_limit),
        gas_price: Some(gas_price),
        data: Some(hex::decode(&data[2..])?.into()),
        chain_id: Some(137u64.into()),
        ..Default::default()
    };

    let signature = wallet.sign_transaction_sync(&tx.clone().into())?;

    let signed = tx.rlp_signed(&signature);
    let tx_hex = format!("0x{}", hex::encode(signed));

    // Broadcast
    let send_resp: serde_json::Value = client
        .post(rpc_url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "method": "eth_sendRawTransaction",
            "params": [tx_hex],
            "id": 4
        }))
        .send()
        .await?
        .json()
        .await?;

    if let Some(error) = send_resp.get("error") {
        anyhow::bail!("Transaction failed: {}", error);
    }

    let tx_hash = send_resp["result"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No tx hash in response"))?
        .to_string();

    Ok(tx_hash)
}
