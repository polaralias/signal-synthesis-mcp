import { AsyncLocalStorage } from 'async_hooks';
import { Router } from './routing/index';

export interface RequestContext {
  router: Router;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
