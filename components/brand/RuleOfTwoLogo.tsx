import { RuleOfTwoMark } from "./RuleOfTwoMark";

type Props = {
  className?: string;
  markClassName?: string;
};

export function RuleOfTwoLogo({
  className = "",
  markClassName = "h-[22px]",
}: Props) {
  return (
    <div
      className={`inline-flex items-center gap-3 ${className}`}
      aria-label="The Rule of Two"
    >
      <span className="whitespace-nowrap text-[13px] font-bold uppercase tracking-[0.24em] text-foreground">
        The Rule Of
      </span>

      <RuleOfTwoMark
        className={markClassName}
      />
    </div>
  );
}