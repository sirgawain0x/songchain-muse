import { HttpError } from "./auth";
export function inheritedOffering(
  kind: string,
  fee: string,
  share: number,
  parent: { seedTermsId?: string; parentRevShare: number },
) {
  if (!parent.seedTermsId)
    throw new HttpError(409, "The seed license must be registered first.");
  if (kind !== "remix" || BigInt(fee) !== 0n || share !== parent.parentRevShare)
    throw new HttpError(
      409,
      "This derivative inherits its seed’s commercial-remix terms. Use a zero test minting fee and the existing seed revenue share; new license flavors cannot be attached to it.",
    );
  return parent.seedTermsId;
}
