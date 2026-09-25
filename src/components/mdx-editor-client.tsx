'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  headingsPlugin,
  InsertTable,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  MDXEditor,
  markdownShortcutPlugin,
  quotePlugin,
  Separator,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  imagePlugin,
  InsertImage,
} from '@mdxeditor/editor';

interface MdxEditorClientProps {
  markdown: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function isSafeEditorUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return false;
  // Block script-like URLs but allow standard markdown link targets.
  return !/^(javascript|vbscript|data):/i.test(url);
}

export function MdxEditorClient({ markdown, onChange, placeholder }: MdxEditorClientProps) {
  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      tablePlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: 'text' }),
      codeMirrorPlugin({ codeBlockLanguages: { text: 'Text' } }),  
      linkPlugin({ validateUrl: isSafeEditorUrl }),
      linkDialogPlugin(),
      imagePlugin(),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarClassName: 'shr-mdxeditor-toolbar',
        toolbarContents: () => (
          <>
            <UndoRedo />
            <Separator />
            <BlockTypeSelect />
            <Separator />
            <BoldItalicUnderlineToggles />
            <Separator />
            <ListsToggle options={['bullet', 'number']} />
            <Separator />
            <InsertTable />
            <Separator />
            <CreateLink />
            <InsertImage />
          </>
        ),
      }),
    ],
    []
  );

  const handleChange = useCallback((nextMarkdown: string) => onChange(nextMarkdown), [onChange]);

  // Popups (link dialog, etc.) must render inside the enclosing native <dialog>,
  // otherwise the backdrop's top-layer stacking hides them.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [overlayContainer, setOverlayContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setOverlayContainer(wrapperRef.current?.closest('dialog') ?? document.body);
  }, []);

  return (
    <div ref={wrapperRef}>
      {overlayContainer && (
        <MDXEditor
          markdown={markdown}
          onChange={handleChange}
          placeholder={placeholder}
          className="shr-mdxeditor light-theme text-gray-900"
          contentEditableClassName="shr-mdxeditor-content prose dark:prose-invert prose-sm sm:prose-base max-w-none min-h-[14rem] px-3 py-2"
          plugins={plugins}
          overlayContainer={overlayContainer}
          onError={(error) => {
            console.error('MDX Editor Error:', JSON.stringify(error));
          }}
        />
      )}
    </div>
  );
}
