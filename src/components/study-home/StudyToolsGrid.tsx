import type { MouseEvent, ReactElement } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { NavigateHandler, StudyTab, StudyTool } from './types';

interface StudyToolsGridProps {
  tools: readonly StudyTool[];
  onNavigate: NavigateHandler;
}

interface ToolCardProps {
  tool: StudyTool;
  onSelect: (id: StudyTab) => void;
}

function ToolCard({ tool, onSelect }: ToolCardProps): ReactElement {
  const Icon = tool.icon;
  const handleClick = (_event: MouseEvent<HTMLButtonElement>): void => onSelect(tool.id);

  return (
    <button type="button" className={`kh-tool kh-tone-${tool.tone}`} onClick={handleClick}>
      <span className="kh-tool-icon" aria-hidden="true">
        <Icon size={20} strokeWidth={2} />
      </span>
      <span className="kh-tool-copy">
        <span className="kh-tool-label">{tool.label}</span>
        <span className="kh-tool-hint">{tool.hint}</span>
      </span>
      <ArrowUpRight className="kh-tool-arrow" size={16} aria-hidden="true" />
    </button>
  );
}

/** 4x1 on wide canvases, 2x2 when the centre column narrows (container query). */
export default function StudyToolsGrid({ tools, onNavigate }: StudyToolsGridProps): ReactElement {
  return (
    <section className="kh-tools-section" aria-labelledby="kh-tools-title">
      <h2 id="kh-tools-title" className="kh-section-title">
        Study tools
      </h2>
      <ul className="kh-tools">
        {tools.map((tool) => (
          <li key={tool.id}>
            <ToolCard tool={tool} onSelect={onNavigate} />
          </li>
        ))}
      </ul>
    </section>
  );
}
