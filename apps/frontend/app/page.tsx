"use client";
import { TypewriterEffectSmooth } from "@/components/ui/typewriter-effect";
import {
  Navbar,
  NavBody,
  NavItems,
  MobileNav,
  NavbarLogo,
  NavbarButton,
  MobileNavHeader,
  MobileNavToggle,
  MobileNavMenu,
} from "@/components/ui/resizable-navbar";
import { useState } from "react";

export function NavbarDemo() {
  const navItems = [
    {
      name: "Marketplace",
      link: "#features",
    },
    {
      name: "Yield",
      link: "#pricing",
    },
    {
      name: "Repuatation System",
      link: "#contact",
    },
  ];

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="relative w-full">
      <Navbar>
        {/* Desktop Navigation */}
        <NavBody>
          <NavbarLogo />
          <NavItems items={navItems} />
          <div className="flex items-center gap-4">
            <NavbarButton variant="secondary">Connect Wallet</NavbarButton>
          </div>
        </NavBody>

        {/* Mobile Navigation */}
        <MobileNav>
          <MobileNavHeader>
            <NavbarLogo />
            <MobileNavToggle
              isOpen={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            />
          </MobileNavHeader>

          <MobileNavMenu
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
          >
            {navItems.map((item, idx) => (
              <a
                key={`mobile-link-${idx}`}
                href={item.link}
                onClick={() => setIsMobileMenuOpen(false)}
                className="relative text-neutral-600 dark:text-neutral-300"
              >
                <span className="block">{item.name}</span>
              </a>
            ))}
            <div className="flex w-full flex-col gap-4">
              <NavbarButton
                onClick={() => setIsMobileMenuOpen(false)}
                variant="primary"
                className="w-full"
              >
                Connect Wallet
              </NavbarButton>
            </div>
          </MobileNavMenu>
        </MobileNav>
      </Navbar>
      <HomePage />

      {/* Navbar */}
    </div>
  );
}

const HomePage = () => {
  const words = [
    {
      text: "A safe",
    },
    {
      text: "P2P",
    },
    {
      text: "marketplace",
    },
    {
      text: "on solana",
    },
    {
      text: "LumeSquare.",
      className: "text-blue-500 dark:text-blue-500",
    },
  ];
  return (
      <div className="flex flex-col items-center justify-center h-[40rem]  ">
        <p className="text-neutral-600 dark:text-neutral-200 text-xs sm:text-base  ">
          Now buy products on solana where every creator is rewarded
        </p>
        <TypewriterEffectSmooth words={words} />
      </div>
    );
};
