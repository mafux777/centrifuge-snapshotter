from substrateinterface import SubstrateInterface
import requests
import pandas as pd

def int_to_hex_utf8(value: int) -> bytes:
    # Step 1: Convert the integer to hex (without the "0x" prefix)
    hex_value = hex(value)[2:]

    # Step 2: Ensure an even number of characters (for proper byte representation)
    if len(hex_value) % 2 != 0:
        hex_value = '0' + hex_value

    # Step 3: Convert hex string to bytes and then encode as UTF-8
    utf8_encoded = bytes.fromhex(hex_value).decode('utf-8', errors='replace')

    return utf8_encoded


substrate = SubstrateInterface(url="wss://fullnode.centrifuge.io/")

h = substrate.get_chain_head()

result = substrate.query_map('PoolRegistry', 'PoolMetadata', max_results=100)

pool_details = {}

for pool, pool_info in result:
    id = pool.value
    meta = pool_info.value['metadata']
    print(f"pool '{id}': {meta}")
    r = requests.get(f"https://ipfs.io/ipfs/{meta}")
    j = r.json()
    name = j['pool']['name']
    pool_details[id] = name

asset_details = []

result = substrate.query_map('Loans', 'ActiveLoans', max_results=100)

for pool, pool_info in result:
    id = pool.value
    for asset in pool_info.value:
        assetId = asset[0]
        collectionId = asset[1]['collateral'][0]
        itemId = asset[1]['collateral'][1]
        unique = substrate.query('Uniques', 'InstanceMetadataOf', [collectionId, itemId])
        ipfs = unique.value['data']
        if "ipfs://" in ipfs:
            ipfs = "/ipfs/" + ipfs.replace("ipfs://", "")
            print(f"Adjusted IPFS URL for {collectionId}/{itemId}: {ipfs}")
        r = requests.get(f"https://ipfs.io{ipfs}")
        if r.status_code == 404:
            print(f"Could not find {ipfs} for {collectionId}/{itemId}")
            asset_details.append({
                "assetId": assetId,
                "poolId": id,
                "poolName": pool_details[id],
                "collectionId": collectionId,
                "itemId": itemId,
                "url": ipfs
            })
            continue
        try:
            j = r.json()
            print(j)
            name = j['name']
            asset_details.append({
                "assetId": assetId,
                "poolId": id,
                "poolName": pool_details[id],
                "collectionId": collectionId,
                "itemId": itemId,
                "url": ipfs,
                "name": name,
            })
        except Exception as e:
            print(f"Could not decode: {r.text}")

df = pd.DataFrame(asset_details)
df.to_csv("asset details.csv", index=False)
print()

