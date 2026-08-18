import { getDataSourceAttribution } from "@/lib/dataSources";

interface DataSourceCreditProps {
  /** Source string as returned by lookup-barcode. */
  source?: string | null;
  className?: string;
}

/**
 * US-633: names the database a food record came from, with its licence.
 *
 * Renders nothing for our own sources, which need no attribution. For Open Food
 * Facts and FoodRepo the ODbL requires the credit to be visible wherever the
 * data is, so this belongs next to the record rather than in a footer.
 */
export const DataSourceCredit = ({ source, className }: DataSourceCreditProps) => {
  const attribution = getDataSourceAttribution(source);
  if (!attribution) return null;

  return (
    <p className={className ?? "text-xs text-muted-foreground"}>
      Data from{" "}
      <a
        href={attribution.url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground"
      >
        {attribution.label}
      </a>
      {attribution.license && attribution.licenseUrl && (
        <>
          {", licensed under "}
          <a
            href={attribution.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            {attribution.license}
          </a>
        </>
      )}
      .
    </p>
  );
};
