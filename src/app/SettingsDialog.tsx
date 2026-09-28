import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  usePreferences,
  type CadColorMode,
  type Density,
  type ThemePreference,
} from '@/store/preferences';
import { useUiStore } from '@/store/ui-store';

export interface SettingsDialogProps {
  /** Project settings editor, rendered in the Project tab when a project is open. */
  projectSettings?: ReactNode;
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as T)} className="flex gap-4">
        {options.map((option) => (
          <div key={option.value} className="flex items-center gap-2">
            <RadioGroupItem value={option.value} id={`${label}-${option.value}`} />
            <Label htmlFor={`${label}-${option.value}`} className="font-normal">
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

/** Settings dialog: browser preferences, project settings and about (FDS section 6). */
export function SettingsDialog({ projectSettings }: SettingsDialogProps) {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.dialog === 'settings');
  const openDialog = useUiStore((s) => s.openDialog);
  const offlineReady = useUiStore((s) => s.offlineReady);
  const theme = usePreferences((s) => s.theme);
  const density = usePreferences((s) => s.density);
  const initials = usePreferences((s) => s.initials);
  const setTheme = usePreferences((s) => s.setTheme);
  const setDensity = usePreferences((s) => s.setDensity);
  const setInitials = usePreferences((s) => s.setInitials);
  const cadColorMode = usePreferences((s) => s.cadColorMode);
  const setCadColorMode = usePreferences((s) => s.setCadColorMode);
  const autoAssignSegment = usePreferences((s) => s.autoAssignSegment);
  const setAutoAssignSegment = usePreferences((s) => s.setAutoAssignSegment);

  return (
    <Dialog open={open} onOpenChange={(next) => openDialog(next ? 'settings' : null)}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="general" className="min-h-80 overflow-y-auto pe-1">
          <TabsList>
            <TabsTrigger value="general">{t('settings.tabs.general')}</TabsTrigger>
            <TabsTrigger value="project">{t('settings.tabs.project')}</TabsTrigger>
            <TabsTrigger value="about">{t('settings.tabs.about')}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="grid gap-6 pt-4">
            <Choice<ThemePreference>
              label={t('settings.theme')}
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: t('settings.themes.system') },
                { value: 'light', label: t('settings.themes.light') },
                { value: 'dark', label: t('settings.themes.dark') },
              ]}
            />
            <Choice<Density>
              label={t('settings.density')}
              value={density}
              onChange={setDensity}
              options={[
                { value: 'compact', label: t('settings.densities.compact') },
                { value: 'comfortable', label: t('settings.densities.comfortable') },
              ]}
            />
            <Choice<CadColorMode>
              label={t('settings.cadColors')}
              value={cadColorMode}
              onChange={setCadColorMode}
              options={[
                { value: 'monochrome', label: t('settings.cadColorModes.monochrome') },
                { value: 'color', label: t('settings.cadColorModes.color') },
              ]}
            />
            <div className="grid max-w-xs gap-2">
              <Label htmlFor="settings-initials">{t('settings.initials')}</Label>
              <Input
                id="settings-initials"
                value={initials}
                maxLength={8}
                onChange={(e) => setInitials(e.target.value)}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">{t('settings.initialsHint')}</p>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="grid gap-1">
                <Label htmlFor="settings-auto-assign">{t('settings.autoAssign')}</Label>
                <p className="text-xs text-muted-foreground">{t('settings.autoAssignHint')}</p>
              </div>
              <Switch
                id="settings-auto-assign"
                checked={autoAssignSegment}
                onCheckedChange={setAutoAssignSegment}
              />
            </div>
          </TabsContent>

          <TabsContent value="project" className="pt-4">
            {projectSettings ?? (
              <p className="text-sm text-muted-foreground">{t('settings.noProject')}</p>
            )}
          </TabsContent>

          <TabsContent value="about" className="grid gap-4 pt-4 text-sm">
            <div>
              <p className="font-medium">{t('app.name')}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {t('app.version', { version: __APP_VERSION__ })}
              </p>
            </div>
            <div>
              <p className="font-medium">{t('settings.offlineTitle')}</p>
              <p className="text-muted-foreground">
                {offlineReady ? t('offline.readyDetail') : t('offline.cachingDetail')}
              </p>
            </div>
            <div>
              <p className="font-medium">{t('settings.privacyTitle')}</p>
              <p className="text-muted-foreground">{t('settings.privacy')}</p>
            </div>
            <div>
              <p className="font-medium">{t('settings.storageTitle')}</p>
              <p className="text-muted-foreground">{t('settings.storage')}</p>
            </div>
            <div data-testid="about-licence">
              <p className="font-medium">{t('settings.licenceTitle')}</p>
              <p className="text-muted-foreground">{t('settings.licence')}</p>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                <a
                  className="text-primary underline"
                  href={__SOURCE_URL__}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('settings.sourceCode')}
                </a>
                <a
                  className="text-primary underline"
                  href={`${import.meta.env.BASE_URL}LICENSE.txt`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('settings.licenceText')}
                </a>
                <a
                  className="text-primary underline"
                  href={`${import.meta.env.BASE_URL}THIRD_PARTY_LICENSES.txt`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('settings.thirdParty')}
                </a>
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
