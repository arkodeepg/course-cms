import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface LessonArticleProps {
  markdown: string;
}

// Renders an article lesson's body. Rendered on the server so the Markdown
// parser never ships to the client: these courses can run to 1000+ lessons.
export function LessonArticle({ markdown }: LessonArticleProps) {
  if (!markdown) {
    return (
      <p className="text-[0.75rem] text-muted-foreground italic">
        This lesson has no written content, the title is the whole task.
      </p>
    );
  }

  return (
    <article
      className="prose prose-invert prose-sm max-w-none
        prose-headings:font-bold prose-headings:text-foreground
        prose-h2:text-base prose-h2:mt-7 prose-h2:mb-2
        prose-h3:text-sm prose-h3:mt-6 prose-h3:mb-2
        prose-h4:text-sm prose-h4:mt-5 prose-h4:mb-1.5 prose-h4:text-brand
        prose-p:text-[0.82rem] prose-p:leading-relaxed prose-p:text-foreground/85
        prose-li:text-[0.82rem] prose-li:leading-relaxed prose-li:text-foreground/85
        prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2
        prose-strong:text-foreground prose-strong:font-semibold
        prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-a:break-words
        prose-blockquote:border-l-brand prose-blockquote:text-muted-foreground
        prose-code:text-brand prose-code:before:content-none prose-code:after:content-none
        prose-img:rounded-md prose-hr:border-border"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
