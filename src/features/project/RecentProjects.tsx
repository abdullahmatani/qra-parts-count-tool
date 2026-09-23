import { FolderClock, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  forgetRecentProject,
  listRecentProjects,
  type RecentProject,
} from '@/services/recent-projects';
import { reopenRecentProject } from './project-actions';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Recent projects on the start screen (PRJ-06). */
export function RecentProjects() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<RecentProject[] | null>(null);
  const refresh = useCallback(() => {
    void listRecentProjects().then(setProjects);
  }, []);
  useEffect(refresh, [refresh]);

  if (!projects) return null;
  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('start.noRecent')}</p>;
  }
  return (
    <ul className="divide-y rounded-md border" data-testid="recent-projects">
      {projects.map((project) => (
        <li key={project.projectId} className="flex items-center gap-2 pe-1">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-start hover:bg-accent"
            onClick={() => void reopenRecentProject(project)}
          >
            <FolderClock className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{project.name}</span>
              <span className="block truncate font-mono text-xs text-muted-foreground">
                {project.directoryName}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {dateFormat.format(new Date(project.openedAt))}
            </span>
          </button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('start.forget', { name: project.name })}
            onClick={() => void forgetRecentProject(project.projectId).then(refresh)}
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  );
}
