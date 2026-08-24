import { network as defaultNetwork, Networks } from "../packages/core-sdk/constants";
import {KMDConnectionParams, NodeConnectionParams} from "../packages/core-sdk/types";

export const supportSettings = true;

export function getNodeConfig(network = defaultNetwork): NodeConnectionParams {
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

export function getOtherNetworkNodeConfigs(network = defaultNetwork): Map<keyof typeof Networks, NodeConnectionParams> {
    const otherNodes: Map<keyof typeof Networks, NodeConnectionParams> = new Map();
    for(const network of Object.keys(Networks)) {
        if(network.toLocaleLowerCase() === defaultNetwork.toLocaleLowerCase()) {
            continue;
        }
        const nodeConfig = getNodeConfig(network as Networks);
        otherNodes.set(network as keyof typeof Networks, nodeConfig);
    }
    return otherNodes;
}

const localHostnames = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);

function isLocalUrl(url: string): boolean {
    try {
        const {hostname} = new URL(url);
        return localHostnames.has(hostname) || hostname.endsWith('.localhost');
    } catch {
        return false;
    }
}

/**
 * A node config that lives on the machine running the browser (localnet).
 */
export function isLocalNodeConfig(config: NodeConnectionParams): boolean {
    return isLocalUrl(config.algod.url) || isLocalUrl(config.indexer.url);
}

/**
 * Whether to offer looking for a transaction on a node on the user's own
 * machine at all. Set `localStorage.probeLocalnet = 'false'` to hide it.
 */
export function shouldProbeLocalNodes(): boolean {
    return localStorage.getItem('probeLocalnet') !== 'false';
}

export type LocalNodeAccess = 'granted' | 'denied' | 'prompt' | 'unknown';

/**
 * Whether the browser already lets this page reach the user's machine.
 *
 * Querying a permission never prompts for it, so this is safe to call while
 * rendering. 'unknown' means the browser does not recognise the permission
 * (every engine but Chrome, and Chrome before it was exposed): treat that like
 * 'prompt' and ask the user first, since the request may still put a dialog or
 * a mixed content block in their way.
 */
export async function getLocalNodeAccess(): Promise<LocalNodeAccess> {
    if (!navigator.permissions?.query) {
        return 'unknown';
    }
    try {
        // Not in the bundled DOM types, and an unknown name rejects.
        const status = await navigator.permissions.query({
            name: 'local-network-access',
        } as unknown as PermissionDescriptor);
        return status.state;
    } catch (e) {
        return 'unknown';
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

export const networkToDomainMap: Record<Networks, string> = {
    "Mainnet": "https://algo.surf",
    "Testnet": "https://testnet.algo.surf",
    "Localnet": "https://localnet.algo.surf",
    "Betanet": "https://betanet.algo.surf",
    "Fnet": "https://fnet.algo.surf",
}

const accountRoute = /^\/account\/([A-Z2-7]{58})(?:\/(.*))?$/;

const accountSubRoutes = new Set([
    "",
    "assets",
    "transactions",
    "created-assets",
    "created-applications",
    "opted-applications",
    "controller",
    "validator",
]);

/**
 * Route (path + query + hash) to carry over when switching networks.
 *
 * Addresses are the same on every network, so account routes survive the switch.
 * Everything else is keyed by network-specific ids (txn / block / asset / app),
 * so those land on the other network's home page instead.
 */
export function getPreservedRoute({ pathname, search = '', hash = '' }: { pathname: string, search?: string, hash?: string }): string {
    const match = pathname.match(accountRoute);
    if (!match) {
        return '';
    }

    const [, address, subRoute = ''] = match;
    // opted-applications/:id embeds a network-specific app id: keep the tab, drop the id
    const tab = subRoute.replace(/\/\d+$/, '').replace(/\/$/, '');
    if (!accountSubRoutes.has(tab)) {
        return '';
    }

    return `/account/${address}${tab ? `/${tab}` : ''}${search}${hash}`;
}
