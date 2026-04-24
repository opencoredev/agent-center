import { ConvexHttpClient } from "convex/browser";
import type {
  ArgsAndOptions,
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  FunctionType,
  OptionalRestArgs,
} from "convex/server";

import { workerEnv } from "../env";

export type ConvexServiceTokenArgs = {
  serviceToken: string;
};

export type ConvexServiceFunction<Type extends FunctionType> = FunctionReference<
  Type,
  "public",
  ConvexServiceTokenArgs,
  unknown
>;

type ServiceCallArgs<Func extends ConvexServiceFunction<FunctionType>> = keyof Omit<
  FunctionArgs<Func>,
  keyof ConvexServiceTokenArgs
> extends never
  ? [args?: Omit<FunctionArgs<Func>, keyof ConvexServiceTokenArgs>]
  : [args: Omit<FunctionArgs<Func>, keyof ConvexServiceTokenArgs>];

export type ConvexServiceClient = {
  query<Query extends ConvexServiceFunction<"query">>(
    query: Query,
    ...args: ServiceCallArgs<Query>
  ): Promise<FunctionReturnType<Query>>;
  mutation<Mutation extends ConvexServiceFunction<"mutation">>(
    mutation: Mutation,
    ...args: ServiceCallArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>>;
  action<Action extends ConvexServiceFunction<"action">>(
    action: Action,
    ...args: ServiceCallArgs<Action>
  ): Promise<FunctionReturnType<Action>>;
};

export function createConvexServiceClient(options: {
  convexUrl: string;
  serviceToken: string;
}): ConvexServiceClient {
  const client = new ConvexHttpClient(options.convexUrl, { logger: false });

  function withServiceToken<Func extends ConvexServiceFunction<FunctionType>>(
    args: ServiceCallArgs<Func>[0],
  ): FunctionArgs<Func> {
    return {
      ...(args ?? {}),
      serviceToken: options.serviceToken,
    } as FunctionArgs<Func>;
  }

  return {
    query(query, ...args) {
      const queryArgs = [withServiceToken<typeof query>(args[0])] as OptionalRestArgs<typeof query>;
      return client.query(query, ...queryArgs);
    },
    mutation(mutation, ...args) {
      const mutationArgs = [withServiceToken<typeof mutation>(args[0])] as unknown as ArgsAndOptions<
        typeof mutation,
        { skipQueue: boolean }
      >;
      return client.mutation(mutation, ...mutationArgs);
    },
    action(action, ...args) {
      const actionArgs = [withServiceToken<typeof action>(args[0])] as OptionalRestArgs<
        typeof action
      >;
      return client.action(action, ...actionArgs);
    },
  };
}

export const convexServiceClient = createConvexServiceClient({
  convexUrl: workerEnv.CONVEX_URL,
  serviceToken: workerEnv.AGENT_CENTER_CONVEX_SERVICE_TOKEN,
});
