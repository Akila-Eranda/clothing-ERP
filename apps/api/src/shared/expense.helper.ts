import { PaymentMethod, Prisma } from '@prisma/client';

export interface CreateLinkedExpenseParams {
  tenantId: string;
  branchId?: string;
  userId?: string;
  amount: number;
  description: string;
  date: Date;
  categoryId?: string;
  paymentMethod?: PaymentMethod;
  reference: string;
}

/** Create an expense once per unique reference (idempotent for payroll / supplier payments). */
export async function createLinkedExpense(
  tx: Prisma.TransactionClient,
  params: CreateLinkedExpenseParams,
) {
  const existing = await tx.expense.findFirst({
    where: { tenantId: params.tenantId, reference: params.reference },
  });
  if (existing) return existing;

  return tx.expense.create({
    data: {
      tenantId: params.tenantId,
      branchId: params.branchId || undefined,
      amount: params.amount,
      description: params.description,
      date: params.date,
      categoryId: params.categoryId,
      paymentMethod: params.paymentMethod ?? PaymentMethod.CASH,
      reference: params.reference,
      createdBy: params.userId,
    },
  });
}
