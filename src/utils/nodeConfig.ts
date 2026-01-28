import { network } from "../packages/core-sdk/constants";
import {KMDConnectionParams, NodeConnectionParams} from "../packages/core-sdk/types";

export const supportSettings = true;

export function getNodeConfig(): NodeConnectionParams {
    const availableNodes = getNodes();

    let defaultNode = availableNodes[1];

    if (network) {
        const networkNode = availableNodes.find(({id}) => id.toLocaleLowerCase().endsWith(network.toLowerCase()));
        if (networkNode) {
            return networkNode;
        }
    }

    return {
        ...defaultNode,
        algod: {
            url: localStorage.getItem('algodUrl') || defaultNode.algod.url,
            port: localStorage.getItem('algodPort') || defaultNode.algod.port,
            token: localStorage.getItem('algodToken') || defaultNode.algod.token,
        },
        indexer: {
            url: localStorage.getItem('indexerUrl') || defaultNode.indexer.url,
            port: localStorage.getItem('indexerPort') || defaultNode.indexer.port,
            token: localStorage.getItem('indexerToken') || defaultNode.indexer.token,
        }
    }
}

export function getKMDConfig(): KMDConnectionParams {
    const defaultKMDConfig: KMDConnectionParams = {
        url: 'http://localhost',
        token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        port: '4002'
    };

    return {
        url: localStorage.getItem('kmdUrl') || defaultKMDConfig.url,
        port: localStorage.getItem('kmdPort') || defaultKMDConfig.port,
        token: localStorage.getItem('kmdToken') || defaultKMDConfig.token,
    }
}

export function getNodes(): NodeConnectionParams[] {
    return [
        {
            id: 'localnet',
            label: 'Localnet',
            algod: {
                url: 'http://localhost',
                port: '4001',
                token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
            },
            indexer: {
                url: 'http://localhost',
                port: '8980',
                token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
            }
        },
        {
            id: 'nodely_mainnet',
            label: 'Algorand Mainnet (Nodely)',
            algod: {
                url: 'https://mainnet-api.4160.nodely.dev',
                port: '443',
                token: '',
            },
            indexer: {
                url: 'https://mainnet-idx.4160.nodely.dev',
                port: '443',
                token: '',
            }
        },
        {
            id: 'nodely_testnet',
            label: 'Algorand Testnet (Nodely)',
            algod: {
                url: 'https://testnet-api.4160.nodely.dev',
                port: '443',
                token: '',
            },
            indexer: {
                url: 'https://testnet-idx.4160.nodely.dev',
                port: '443',
                token: '',
            }
        },
        {
            id: 'nodely_betanet',
            label: 'Algorand Betanet (Nodely)',
            algod: {
                url: 'https://betanet-api.4160.nodely.dev',
                port: '443',
                token: '',
            },
            indexer: {
                url: 'https://betanet-idx.4160.nodely.dev',
                port: '443',
                token: '',
            }
        },
        {
            id: 'nodely_fnet',
            label: 'Algorand Fnet (Nodely)',
            algod: {
                url: 'https://fnet-api.4160.nodely.dev',
                port: '443',
                token: '',
            },
            indexer: {
                url: 'https://fnet-idx.4160.nodely.dev',
                port: '443',
                token: '',
            }
        },
    ];
}
