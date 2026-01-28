import { network } from "../../../packages/core-sdk/constants"
import { OpenInBase, PageType } from "./OpenInBase"
import { OpenInRegistry } from "./OpenInSites"

export const openInOptions = (pageType: PageType): OpenInBase[] => {
    return Object.values(OpenInRegistry).filter(r => r.has(pageType) && r.networks.has(network))
}