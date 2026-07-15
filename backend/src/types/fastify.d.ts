import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    user_id: string;
  }
}
