import { Networks } from "../../../packages/core-sdk/constants";
import { OpenInBase, PageType } from "./OpenInBase";
import { OpenInRegistry } from "./OpenInSites";

export const getOpenInOptions = (
  network: Networks,
  pageType: PageType,
  exclude?: string[],
): OpenInBase[] =>
  OpenInRegistry.filter(
    (r) =>
      r.supportsNetwork(network) &&
      r.supportsPageType(pageType) &&
      !exclude?.includes(r.siteName),
  );
