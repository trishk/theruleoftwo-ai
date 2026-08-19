type Props = {
  className?: string;
};

export function RuleOfTwoMark({
  className = "",
}: Props) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center gap-[5px] ${className}`}
    >
      <span className="h-full w-[4px] rounded-full bg-[#2563EB] shadow-[0_0_6px_rgba(37,99,235,0.45)] dark:shadow-[0_0_7px_rgba(37,99,235,0.6)]" />

      <span className="h-full w-[4px] rounded-full bg-[#DC2626] shadow-[0_0_6px_rgba(220,38,38,0.4)] dark:shadow-[0_0_7px_rgba(220,38,38,0.55)]" />
    </span>
  );
}