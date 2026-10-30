/**
 * Renders a schema.org graph as a JSON-LD script tag. The `<` escaping keeps a
 * `</script>` sequence inside any string from closing the tag early.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
