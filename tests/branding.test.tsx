import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom/vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-sans" }),
  Geist_Mono: () => ({ variable: "font-mono" }),
}));

import { metadata } from "@/app/layout";
import { RuleOfTwoLogo } from "@/components/brand/RuleOfTwoLogo";

describe("canonical product branding", () => {
  it("uses the canonical product name in metadata", () => {
    expect(metadata.title).toEqual({
      default: "TheRuleOfTwo.ai",
      template: "%s | TheRuleOfTwo.ai",
    });
    expect(metadata.applicationName).toBe("TheRuleOfTwo.ai");
  });

  it("gives the stylized logo one canonical accessible name", () => {
    const { container } = render(<RuleOfTwoLogo />);

    expect(screen.getByLabelText("TheRuleOfTwo.ai")).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-label="TheRuleOfTwo.ai"]')).toHaveLength(1);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
