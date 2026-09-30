"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText } from "lucide-react";

interface PdfLessonProps {
  src: string;
  title: string;
}

// Inline PDF viewing only works on desktop browsers: Android Chrome has no
// inline viewer and iOS Safari shows a single page. Phones and tablets get
// Open / Download buttons (the OS viewer handles the new tab); desktops (lg+
// or a fine pointer) get the iframe. The server renders the buttons, so no
// PDF is fetched on phones and there is no hydration mismatch.
const DESKTOP_QUERY = "(min-width: 1024px), (pointer: fine)";

export function PdfLesson({ src, title }: PdfLessonProps) {
  const [inline, setInline] = useState(false);

  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(DESKTOP_QUERY);
    } catch {
      return;
    }
    const sync = () => setInline(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  if (inline) {
    return <iframe src={src} title={title} className="w-full h-[80dvh] border-0 bg-white" />;
  }

  const downloadHref = `${src}${src.includes("?") ? "&" : "?"}download=1`;
  return (
    <div className="flex flex-col items-center justify-center gap-3 bg-black w-full px-6 py-10 text-center lg:h-[80dvh]">
      <FileText className="h-8 w-8 text-brand" />
      <p className="text-[0.95rem] font-semibold text-foreground">This lesson is a PDF</p>
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
        Open it in your device&apos;s PDF viewer, or save a copy.
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Open PDF
        </a>
        <a
          href={downloadHref}
          download
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-secondary/30 px-4 text-sm font-medium text-foreground hover:bg-secondary/60 transition-colors"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      </div>
    </div>
  );
}
