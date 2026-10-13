import type { Root } from 'mdast';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { PluggableList, Plugin } from 'unified';

const allowedInlineHtmlTags = new Set([
  'abbr',
  'br',
  'cite',
  'kbd',
  'mark',
  'q',
  'samp',
  'small',
  'span',
  'sub',
  'sup',
  'time',
  'u',
  'var',
]);

const htmlTagPattern = /<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi;

// `document:`/`documents:` and `portrait:` are pseudo-protocols used by
// TaggedDocument/TaggedImage to resolve Cloudinary assets by tag; the
// sanitizer's default protocol allowlist would otherwise strip them from
// `href`/`src`.
const markdownInlineHtmlSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), ...allowedInlineHtmlTags],
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'document', 'documents'],
    src: [...(defaultSchema.protocols?.src ?? []), 'portrait'],
  },
};

function isAllowedInlineHtml(value: string): boolean {
  const tags = [...value.matchAll(htmlTagPattern)];
  return (
    tags.length > 0 &&
    tags.every((tag) => allowedInlineHtmlTags.has(tag[1].toLowerCase()))
  );
}

export const remarkInlineHtmlOnly: Plugin<[], Root> = () => (tree) => {
  function filterHtml(node: Root | Root['children'][number]) {
    if ('children' in node) {
      node.children = node.children.map((child) => {
        if (child.type === 'html' && !isAllowedInlineHtml(child.value)) {
          return { type: 'text', value: child.value };
        }
        if ('children' in child) filterHtml(child);
        return child;
      });
    }
  }

  filterHtml(tree);
};

export const markdownRehypePlugins: PluggableList = [
  rehypeRaw,
  [rehypeSanitize, markdownInlineHtmlSchema],
];
