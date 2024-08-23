import { cryptoWaitReady } from "@polkadot/util-crypto";
import { decodeAddress } from "@polkadot/keyring";
import "@polkadot/api-augment";
import Centrifuge from "@centrifuge/centrifuge-js";
import { firstValueFrom, switchMap, combineLatest, map, forkJoin } from "rxjs";
const paraTool = require("../polkaholic-pro/substrate/paraTool");


const centrifuge = new Centrifuge({
  // centrifugeWsUrl: "wss://fullnode.centrifuge.io/",
  centrifugeWsUrl: "wss://centrifuge-rpc.dwellir.com/",
});

const fs = require('fs');
const yargs = require("yargs/yargs");
const path = require('path');
const { hideBin } = require("yargs/helpers");
const args = yargs(hideBin(process.argv))
    // .option("parachain-endpoint", {
    //     description: "The wss url of the parachain",
    //     type: "string",
    //     demandOption: true,
    // })
    .option("start-date", { // Adding the start-date option
        description: "The start date in YYYY-MM-DD [h] format (hour optional)",
        type: "string",
        demandOption: true, // Making it required
    })
    .option("end-date", { // Adding the start-date option
        description: "The end date in YYYY-MM-DD [h] format (hour optional)",
        type: "string",
        demandOption: false, // Making it optional
    })
    .option("out", { // Adding the start-date option
        description: "The output directory (will be created if needed)",
        type: "string",
        default: "/tmp",
        demandOption: false, // Making it optional
    })
    .argv;

function main(){
    return fetchAndProcess();
}

main().catch((err) => {
    console.log("Error thrown by script:");
    console.log(err);
    process.exit(1)
});



type Snapshot = {
  snapshotDT: string;
  hr: number;
  indexTS: number;
  startBN: number;
  endBN: number;
  startTS: number;
  endTS: number;
  start_blockhash: string;
  end_blockhash: string;
};

async function fetchSnapshotData(chainId: number, logDT: string, startHR: number, finalHR: number): Promise<Snapshot[]> {
    const response = await fetch(`https://api-polka.colorfulnotion.com/snapshot/${chainId}?logDT=${logDT}&startHR=${startHR}&finalHR=${finalHR}`);
    if (!response.ok) {
        throw new Error("Failed to fetch data");
    }
    const j: Snapshot[] = await response.json();
    return j;
}

function parseDateAndHour(dateStr: string): { date: Date; hour: number | null } {
    let hour: number | null = null;

    // Split the input string to separate the date and possible hour parts
    const parts = dateStr.split(' ');

    // Append 'Z' to indicate UTC time if only the date part is provided or construct ISO string in UTC
    const isoDateStr = parts[0] + (parts.length > 1 ? `T${parts[1].padStart(2, '0')}:00:00Z` : "T00:00:00Z");

    // Create a Date object from the ISO string in UTC
    const date = new Date(isoDateStr);

    // If an hour part was provided, parse it as integer
    if (parts.length > 1) {
        hour = parseInt(parts[1], 10);
    }

    return { date, hour };
}


interface JSONableCodec {
  toJSON(): any;
}

interface Serializable {
  toJSON: () => string;
}

function convertToUnixTimestamp(datePart: Date, hourPart?: number | null): number {
    // Clone the datePart to avoid mutating the original datePart
    const dateTime = new Date(datePart.getTime());

    // Ensure the hour part is correctly adjusted in UTC
    if (hourPart !== undefined && hourPart !== null) {
        // Use setUTCHours to correctly adjust the hour in UTC
        dateTime.setUTCHours(hourPart, 0, 0, 0); // Sets the hours, minutes, seconds, and milliseconds in UTC
    }
    // Convert the dateTime object to a Unix timestamp in milliseconds and then to seconds
    const unixTimestampInSeconds = Math.floor(dateTime.getTime() / 1000);

    return unixTimestampInSeconds;
}

function hexToUtf8(hexString: string): string {
    // Check for and remove '0x' prefix if present
    if (hexString.startsWith('0x')) {
        hexString = hexString.slice(2);
    }

    // Validate hex string
    if (!/^[0-9a-fA-F]+$/.test(hexString)) {
        throw new Error('Invalid hexadecimal input');
    }

    // Ensure the hex string length is even
    if (hexString.length % 2 !== 0) {
        throw new Error('Hexadecimal input length should be even');
    }

    // Convert hex string to bytes
    const bytes = new Uint8Array(hexString.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

    // Use TextDecoder to decode the byte array to a string
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(bytes);

    return text;
}

function unixTimestampToIsoDate(unixTimestamp: number): string {
  // Create a Date object from the Unix timestamp (in milliseconds)
  const date = new Date(unixTimestamp * 1000);

  // Convert the date to an ISO string and then take only the date part
  const isoDate = date.toISOString().split('T')[0];

  return isoDate;
}

type ConversionFunction = (value: any) => any;

interface ConversionMap {
    [key: string]: ConversionFunction;
}

interface NavType {
  navAum: string;
  navFees: string;
  reserve: string;
}

interface Pool {
  // Assuming types for variables not shown in the snippet
  chain_name: string;
  block_hash: string;
  block_number: number;
  ts: number; // Assuming timestamp is a number
  section: string;
  storage: string;
  track: string;
  track_val: NavType | null; // Assuming navType or null if nav might not exist
  source: string;
  kv: string; // Assuming poolId is a string
  pv: {
    nav: {
      nav_aum: number;
      nav_fees: number;
      onchain_cash: number;
      total: number;
    };
    tranches: Tranche[];
  };
}

interface Tranche {
  id: string;
  share: number;
  pricePerShare: number;
  value: number;
}

interface LocalAsset {
    localAsset: number
}
interface PoolCurrency {
    currency: LocalAsset;
}

interface Currency {
    decimals: number;
  symbol: string;
}

interface TrancheID {
    tranches: {
        ids: string[];
    };
}

interface Result {
  poolId: string;
  totalIssuance: { toJSON: () => string }[];
  trancheTokenPrices?: string[];
  nav?: NavType;
}

// Define a conversion map specific to your needs
function applyConversion(obj: any, conversionMap: ConversionMap, path: string[] = []): void {
    if (typeof obj === 'object' && obj !== null) {
        Object.entries(obj).forEach(([key, value]) => {
            const newPath = [...path, key];
            const pathString = newPath.join('.');
            if (pathString in conversionMap) {
                obj[key] = conversionMap[pathString](value);
            } else {
                applyConversion(value, conversionMap, newPath);
            }
        });
    }
}


async function fetchAndProcess(): Promise<void> {
    // Parse start date and optionally extract hour
    const { date: startDate, hour: startHour } = parseDateAndHour(args["start-date"]);

    let endDate;
    let endHour = null;

    if (args["end-date"]) {
        // If end date is provided, parse it in the same way as the start date
        const parsedEndDate = parseDateAndHour(args["end-date"]);
        endDate = parsedEndDate.date;
        endHour = parsedEndDate.hour;
    } else {
        // Get the current date and time
         let now = new Date();
         // Subtract one hour from the current time
         now.setHours(now.getHours() - 1);
         // Adjust `now` to the start of that hour
         now.setMinutes(0, 0, 0); // Sets minutes, seconds, and milliseconds to 0
         endDate = now; // today!
    }

    let startTS = convertToUnixTimestamp(startDate,startHour)
    let endTS = convertToUnixTimestamp(endDate, endHour)

    console.log(`startDate=${startDate.toISOString()}. startHour=${startHour}. endDate=${endDate.toISOString()}. endHour=${endHour} (startTS=${startTS}, endTS=${endTS})`);

    // Loop through all relevant dates
    const paraID = 2031;
    const relayChain = "polkadot";
    const chain_name = "Centrifuge"; // Can use mixed case because it is meant for end users

    for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateString = d.toISOString().split("T")[0].replace(/-/g, "");
        const data = await fetchSnapshotData(paraID, dateString, 0, 23);
        console.log(`[${d}] data`, data)
        for (const data_hr of data) {
            let target_indexTS = data_hr.indexTS
            let target_hr = data_hr.hr
            let targetHR = `${target_hr.toString().padStart(2, '0')}`;
            if (startTS <= target_indexTS && target_indexTS <= endTS) {
                console.log(`[${d.toISOString()} targetHR=${targetHR}] proceed!!`)
            } else {
                console.log(`[${d.toISOString()} targetHR=${targetHR}] SKIP!!`)
                continue
            }
            const my_blockhash = data_hr.end_blockhash; // last hash of the hour in question
            if (!my_blockhash) {
                console.log(`We have reached the end of the road...`);
                break;
            }
            const my_blockno = data_hr.endBN; // last block of that hour
            const ts = data_hr.endTS; // timestamp in Linux notation
            let section = "pool";
            let storage = "nav";
            let track = "pool";
            const source = "funkmeister380";

            console.log(`Connecting to parachain at ${my_blockhash}`);

                const poolData = centrifuge.getApi().pipe(
                  map(api => api.at(my_blockhash)),
                  switchMap(api => {
                    const pools = centrifuge.pools.getPools();
                    return combineLatest([api, pools]);
                  }),
                  switchMap(([api, pools]) => {
                    const poolCalls = pools.map(pool => {
                      const trancheTotalIssuance = pool.tranches.map(tranche =>
                        api.query.ormlTokens.totalIssuance({ Tranche: [pool.id, tranche.id] })
                      );
                      return forkJoin([
                        api.call.poolsApi.nav(pool.id),
                        api.call.loansApi.portfolio(pool.id),
                        api.call.poolsApi.trancheTokenPrices(pool.id),
                        api.query.poolSystem.pool(pool.id),
                        ...trancheTotalIssuance,
                      ]).pipe(
                        switchMap(([nav, portfolio, trancheTokenPrices, poolCurrency,...totalIssuance]) => {
                          // Use poolCurrency to fetch metadata
                          const poolCurr = poolCurrency.toJSON() as unknown as PoolCurrency;
                          return api.query.ormlAssetRegistry.metadata(poolCurr.currency).pipe(
                            map(metadata => ({
                              poolId: pool.id,
                              nav: nav.toJSON(),
                              portfolio: portfolio.toJSON(),
                              trancheTokenPrices: trancheTokenPrices.toJSON(),
                              totalIssuance,
                              poolCurrency: poolCurrency.toJSON(),
                              metadata: metadata.toJSON(), // Add the metadata to your final object
                            }))
                          );
                        })
                      );
                    });
                    return forkJoin(poolCalls);
                  })
                );

            const results = await firstValueFrom(poolData);
            console.log(results);

            const poolValues: string[] = [];

            // iterate through the pools
            for(const p of results) {
                console.log(`poolId=${p.poolId} `);

                // Work on the "Assets", which are available in the portfolio. This is a list of assets in the pool
                // portfolio is an array of arrays
                let assets = [];
                if(!p.portfolio) {
                    throw new Error('portfolio is missing');
                } else
                    assets = p.portfolio as any[];

                const poolCurrency = p.poolCurrency as unknown as PoolCurrency;
                const pc = poolCurrency.currency;

                for (let i = 0; i < assets.length; i++) {
                    const assetId = assets[i][0];
                    let asset_type: string;
                    if("internal" in assets[i][1].activeLoan.pricing && "cash" in assets[i][1].activeLoan.pricing.internal.info.valuationMethod) {
                        asset_type = "OffchainCash";
                    } else {
                        asset_type = "Other";
                    }

                    // @ts-ignore
                    const asset = {
                        chain_name: chain_name,
                        block_hash: my_blockhash,
                        block_number: my_blockno,
                        ts: ts,
                        section: 'assets',
                        storage: 'loans',
                        track: 'portfolio', // arbitrary
                        //track_val: p.nav,
                        source: source,

                        kv: {
                            asset_id:
                            {
                                pool: p.poolId,
                                id: assetId
                            }
                        },
                        pv : {
                            pool_currency: {
                                currency: pc,
                                decimals: (p.metadata as unknown as Currency).decimals,
                                symbol: hexToUtf8((p.metadata as unknown as Currency).symbol)
                            },
                            total_repaid_principal: assets[i][1].activeLoan.totalRepaid.principal,
                            total_repaid_interest: assets[i][1].activeLoan.totalRepaid.interest,
                            total_repaid_unscheduled: assets[i][1].activeLoan.totalRepaid.unscheduled,
                            total_borrowed: assets[i][1].activeLoan.totalBorrowed,
                            present_value: assets[i][1].presentValue,
                            maturity_date: assets[i][1].activeLoan.schedule?.maturity?.fixed?.date,
                            outstanding_principal: assets[i][1].outstandingPrincipal,
                            outstanding_interest: assets[i][1].outstandingInterest,
                            type: asset_type
                        }
                    };
                    poolValues.push(JSON.stringify(asset));
                }

                // Ensure all arrays have the same length
                const length = p.totalIssuance.length;

                // Initialize an array of the specified length
                let tranches = new Array(length);
                let trancheIdDetails = p.poolCurrency as unknown as TrancheID;

                if (!p.trancheTokenPrices) {
                    throw new Error('trancheTokenPrices is missing');
                }


                // Populate the tranches array with the first elements of each array
                for (let i = 0; i < length; i++) {
                    const pricePerShare = paraTool.dechexToInt((p.trancheTokenPrices as string[])[i]);
                    const share = paraTool.dechexToInt(p.totalIssuance[i].toJSON());
                    tranches[i] = {
                        id: trancheIdDetails.tranches.ids[i],
                      share,
                      pricePerShare,
                      value: share * 1.0 * pricePerShare / 1e18
                    };
                }

                let nav_aum: number;
                let nav_fees: number;
                let onchain_cash: number;

                type navType = {
                    navAum: string;
                    navFees: string;
                    reserve: string;
                }

                const my_nav = p.nav as navType;

                if (p.nav) {
                    nav_aum = paraTool.dechexToInt(my_nav.navAum);
                    nav_fees = paraTool.dechexToInt(my_nav.navFees);
                    onchain_cash = paraTool.dechexToInt(my_nav.reserve);
                } else {
                    nav_aum = 0;
                    nav_fees = 0;
                    onchain_cash = 0;
                }

                let pool = {
                    chain_name: chain_name,
                    block_hash: my_blockhash,
                    block_number: my_blockno,
                    ts: ts,
                    section: section,
                    storage: storage,
                    track: track,
                    //track_val: p.nav,
                    source: source,
                    kv: p.poolId,
                    pv: {
                        nav: {
                            nav_aum: nav_aum, // Positive impact on total, Decimals equal to pool_currency
	                        nav_fees: nav_fees, // Negative impact on total, Decimals equal to pool_currency
	                        onchain_cash: onchain_cash, // Positive impact on total, Decimals equal to pool_currency
	                        total: nav_aum + onchain_cash - nav_fees // Decimals equal to pool_currency
                        },
                        tranches: tranches
                    }
                };
                poolValues.push(JSON.stringify(pool));
            }


            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, "0"); // JavaScript months are 0-indexed.
            const day = String(d.getDate()).padStart(2, "0");

            // Construct the directory path dynamically
            const dirPath = `${args["out"]}/${relayChain}/${paraID}/${year}/${month}/${day}/`;

            // Ensure the directory exists
            fs.mkdirSync(dirPath, {recursive: true});

            // Construct the full file path
            const filePath = path.join(dirPath, `${relayChain}_snapshots_${paraID}_${dateString}_${targetHR}.json`);

            fs.writeFileSync(filePath, poolValues.join("\n")); // one line per item
            console.log(`Data written to ${filePath} JSON successfully`);
        }
    }
    console.log("Done!");
    process.exit(0);
}
