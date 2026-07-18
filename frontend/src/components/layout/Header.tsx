import Image from "next/image";
import Link from "next/link";
import { company } from "@/config/company";
import { HeaderUserMenu } from "./HeaderUserMenu";

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 sm:h-16 sm:px-6">
      <Link href="/dashboard" className="flex items-center gap-2">
        <Image src={company.logoUrl} alt={`${company.name} logo`} width={32} height={32} className="rounded-md" />
        <span className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{company.name}</span>
      </Link>
      <HeaderUserMenu />
    </header>
  );
}
