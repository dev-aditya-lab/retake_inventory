import Image from "next/image";
import { company } from "@/config/company";

/**
 * "For {company}", the authorised signatory's signature, and the signature
 * line — shared by every invoice, credit note and bill, on screen and in print.
 */
export function AuthorisedSignatory({ legalName = company.legalName }: { legalName?: string }) {
  return (
    <div className="w-48 self-end text-center text-xs">
      <p className="text-ink-600">For {legalName}</p>
      {/* Eager, not lazy: it sits at the foot of the page, and a lazy image can still be unloaded when window.print() runs. */}
      <Image
        src={company.signatureUrl}
        alt="Authorised signatory's signature"
        width={112}
        height={48}
        loading="eager"
        className="mx-auto my-0.5"
      />
      <p className="border-t border-ink-400 pt-1">Authorised Signatory</p>
    </div>
  );
}
