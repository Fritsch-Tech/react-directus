import {
  authentication as addAuthenticationClient,
  graphql as addGraphqlClient,
  realtime as addRealtimeClient,
  rest as addRestClient,
  staticToken as addStaticTokenClient,
  AuthenticationClient,
  AuthenticationConfig,
  AuthenticationData,
  AuthenticationMode,
  createDirectus,
  DirectusClient,
  GraphqlClient,
  GraphqlConfig,
  RestClient,
  RestConfig,
  StaticTokenClient,
  WebSocketClient,
  WebSocketConfig,
} from '@directus/sdk';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { localAuthStorage } from 'authStores/localAuthStorage';

export enum AuthStates {
  LOADING = 'loading',
  AUTHENTICATED = 'authenticated',
  UNAUTHENTICATED = 'unauthenticated',
}

/**
 * Shape of the main context.
 * @typeParam T - The `TypeMap` of your Directus instance.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DirectusContextType<Schema extends object = any, Clients = any> {
  apiUrl: string;
  directus: DirectusClient<Schema> & Clients;
  authState: AuthStates;
}

export interface DirectusProviderProps {
  /** url to your Directus instance. */
  apiUrl: string;
  /**
   * If `true`, the provider will try to login the user automatically on mount.
   * @defaultValue false
   */
  autoLogin?: boolean;
  onAuthStateChanged?: (authState: AuthStates) => void;
  children: ReactNode;
}

export interface createDirectusProviderProps {
  authentication?: boolean | { mode: AuthenticationMode; config: Partial<AuthenticationConfig | undefined> };
  rest?: boolean | { config: Partial<RestConfig | undefined> };
  graphql?: boolean | { config: Partial<GraphqlConfig | undefined> };
  realTime?: boolean | { config: Partial<WebSocketConfig | undefined> };
  staticToken?: { accsessToken: string };
}

export const createDirectusProvider = <Schema extends object>({
  authentication,
  rest,
  graphql,
  realTime,
  staticToken,
}: createDirectusProviderProps) => {
  // add AuthenticationClient<Schema> type if typeof authentication === 'object' or boolean
  // add RestClient<Schema> type if typeof rest === 'object' or boolean
  type Clients = (typeof authentication extends boolean ? never : AuthenticationClient<Schema>) &
    (typeof rest extends boolean ? never : RestClient<Schema>) &
    (typeof graphql extends boolean ? never : GraphqlClient<Schema>) &
    (typeof realTime extends boolean ? never : WebSocketClient<Schema>) &
    (typeof staticToken extends undefined ? never : StaticTokenClient<Schema>);

  type ContextType = DirectusContextType<Schema, Clients>;

  const DirectusContext = createContext<ContextType | null>(null);

  const DirectusProvider = ({ apiUrl, autoLogin, onAuthStateChanged, children }: DirectusProviderProps) => {
    const [authState, setAuthState] = useState<AuthStates>(autoLogin ? AuthStates.LOADING : AuthStates.UNAUTHENTICATED);

    const modAuthStorage = useMemo(() => {
      let authStorage = localAuthStorage;

      if (typeof authentication === 'object' && authentication?.config?.storage) {
        authStorage = authentication?.config?.storage;
      }

      return {
        get: authStorage.get,
        set: async (value: AuthenticationData | null) => {
          if (!value?.access_token) {
            setAuthState(AuthStates.UNAUTHENTICATED);
          } else {
            setAuthState(AuthStates.AUTHENTICATED);
          }
          await authStorage.set(value);
        },
      };
    }, []);

    const directus = useMemo(() => {
      let directus = createDirectus<Schema>(apiUrl) as DirectusClient<Schema> & Clients;

      if (authentication) {
        if (typeof authentication === 'boolean') {
          directus.with(addAuthenticationClient(undefined, { storage: modAuthStorage }));
        } else {
          directus.with(
            addAuthenticationClient(authentication.mode, { ...authentication.config, storage: modAuthStorage })
          );
        }
        // change directus type to & AuthenticationClient<Schema>
        directus as DirectusClient<Schema> & AuthenticationClient<Schema>;
      }

      if (rest) {
        directus.with(addRestClient());
      }
      if (graphql) {
        directus.with(addGraphqlClient());
      }
      if (realTime) {
        directus.with(addRealtimeClient());
      }

      if (staticToken) {
        directus.with(addStaticTokenClient(staticToken.accsessToken));
      }
      return directus;
    }, [apiUrl]);

    const value = useMemo<ContextType>(
      () => ({
        apiUrl,
        directus,
        authState,
      }),
      [apiUrl, directus, authState]
    );

    useEffect(() => {
      const checkAuth = async () => {
        const authData = await modAuthStorage.get();
        if (authData?.access_token) {
          setAuthState(AuthStates.AUTHENTICATED);
        } else {
          setAuthState(AuthStates.UNAUTHENTICATED);
        }
      };

      if (autoLogin) {
        checkAuth();
      }
    }, []);

    useEffect(() => {
      if (onAuthStateChanged) {
        onAuthStateChanged(authState);
      }
    }, [authState, onAuthStateChanged]);

    return <DirectusContext.Provider value={value}>{children}</DirectusContext.Provider>;
  };

  /**
   * useDirectus is a React Hook that provides an instance of the Directus SDK and the apiUrl
   * @returns DirectusContextType
   * @example Here is an example of how to use useDirectus
   * ```tsx
   *   const { directus } = useDirectus();
   *   directus.auth.login({ email: '', password: '' });
   * ```
   */
  const useDirectus = () => {
    const directusContext = useContext(DirectusContext);

    if (!directusContext) {
      throw new Error('useDirectus has to be used within the DirectusProvider');
    }

    return directusContext;
  };

  return {
    DirectusContext,
    DirectusProvider,
    useDirectus,
  };
};
