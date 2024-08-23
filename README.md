# Nedo

Use this script to take a snapshot of Interlay vault collaterals. 


Clone this repository and enter into the root folder.

```bash
git@github.com:mafux777/nedo
cd nedo
yarn install
```

Compile typescript with `tsc`

Run the script with 

`node ./snapshot-centrifuge.js --out <some_dir> --start-date 2023-10-01

The output will look like this:

```bash
poolId=1615768079 
poolId=4139607887 
poolId=1655476167 
Data written to /tmp/polkadot/2031/2024/07/04/polkadot_snapshots_2031_20240704_18.json JSON successfully
[2024-07-04T00:00:00.000Z targetHR=19] proceed!!
Connecting to parachain at 0x4647103a0b5af25fc7df9a4977d7d3f693948fa7b1b186b65770ec52fb0655c6

```

Each file has entries like this:

```json
{
  "chain_name": "Centrifuge",
  "block_hash": "0xdd2abcb6910e879e694be87d81317299530152387076a145090891707a1f100e",
  "block_number": 5825081,
  "ts": 1720119589,
  "section": "pool",
  "storage": "nav",
  "track": "pool",
  "source": "funkmeister380",
  "kv": "1615768079",
  "pv": {
    "nav": {
      "nav_aum": 0,
      "nav_fees": 0,
      "onchain_cash": 143360978109,
      "total": 143360978109
    },
    "tranches": [
      {
        "id": "0x6756e091ae798a8e51e12e27ee8facdf",
        "share": 100000000000,
        "pricePerShare": 1000000000000000000,
        "value": 99999999999.99998
      },
      {
        "id": "0xda64aae939e4d3a981004619f1709d8f",
        "share": 43360978109,
        "pricePerShare": 1000000000000000000,
        "value": 43360978109
      }
    ]
  }
}
```

