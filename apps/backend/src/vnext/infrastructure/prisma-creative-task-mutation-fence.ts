import { Prisma } from "@prisma/client";

type CreativeTaskMutationFenceTransaction = Pick<
  Prisma.TransactionClient,
  "$executeRaw"
>;

export async function lockCreativeTaskMutationWindow(
  transaction: CreativeTaskMutationFenceTransaction,
) {
  await transaction.$executeRaw(
    Prisma.sql`LOCK TABLE "vnext_creative_tasks" IN SHARE ROW EXCLUSIVE MODE`,
  );
}
