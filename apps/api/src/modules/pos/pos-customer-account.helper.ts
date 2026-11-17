export type CustomerAccountTender = {
  walletAmount: number;
  creditAmount: number;
};

function cents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100);
}

export function splitCustomerAccountTender(
  amount: number,
  walletBalance: number,
): CustomerAccountTender {
  const amountCents = Math.max(0, cents(amount));
  const walletCents = Math.max(0, cents(walletBalance));
  const walletAmount = Math.min(amountCents, walletCents);

  return {
    walletAmount: walletAmount / 100,
    creditAmount: (amountCents - walletAmount) / 100,
  };
}
