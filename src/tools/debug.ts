import { Router } from '../routing/index';
import { config } from '../config';

export interface RoutingDebugInfo {
  config: {
    discovery: string;
    quotes: string;
    bars: string;
    context: string;
    cachingEnabled: boolean;
    cacheTtl: number;
  };
  activeProviders: {
    discovery: string;
    quotes: string;
    bars: string;
    context: string;
  };
}

export function explainRouting(router: Router): RoutingDebugInfo {
  return {
    config: {
        discovery: config.DEFAULT_DISCOVERY_PROVIDER,
        quotes: config.DEFAULT_QUOTES_PROVIDER,
        bars: config.DEFAULT_BARS_PROVIDER,
        context: config.DEFAULT_CONTEXT_PROVIDER,
        cachingEnabled: config.ENABLE_CACHING,
        cacheTtl: config.CACHE_TTL
    },
    activeProviders: {
        discovery: router.getDiscoveryProvider().constructor.name,
        quotes: router.getQuotesProvider().constructor.name,
        bars: router.getBarsProvider().constructor.name,
        context: router.getContextProvider().constructor.name
    }
  };
}
