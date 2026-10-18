import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ScriptsService } from './core/services/scripts.service';
import {
  DEFAULT_SCRIPT_ICON,
  FAVORITE_SCRIPT_IDS,
  OTHER_GROUP_TITLE,
  SCRIPT_GROUPS,
  SCRIPT_ICONS
} from './core/nav-config';

interface NavScript {
  id: string;
  label: string;
  icon: string;
}

interface NavGroup {
  title: string;
  scripts: NavScript[];
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, TooltipModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'ServisesVI';
  readonly collapsed = signal(false);
  readonly favorites = signal<NavScript[]>([]);
  readonly groups = signal<NavGroup[]>([]);

  constructor(private readonly scriptsService: ScriptsService) {}

  ngOnInit(): void {
    this.scriptsService.list().subscribe((scripts) => {
      const byId = new Map(scripts.map((s) => [s.id, s.name]));
      const toNavScript = (id: string): NavScript => ({
        id,
        label: byId.get(id)!,
        icon: SCRIPT_ICONS[id] ?? DEFAULT_SCRIPT_ICON
      });

      this.favorites.set(FAVORITE_SCRIPT_IDS.filter((id) => byId.has(id)).map(toNavScript));

      const categorized = new Set(FAVORITE_SCRIPT_IDS);
      const groups: NavGroup[] = SCRIPT_GROUPS.map((g) => {
        g.scriptIds.forEach((id) => categorized.add(id));
        return { title: g.title, scripts: g.scriptIds.filter((id) => byId.has(id)).map(toNavScript) };
      });

      const leftover = scripts.filter((s) => !categorized.has(s.id));
      if (leftover.length > 0) {
        groups.push({
          title: OTHER_GROUP_TITLE,
          scripts: leftover.map((s) => ({ id: s.id, label: s.name, icon: SCRIPT_ICONS[s.id] ?? DEFAULT_SCRIPT_ICON }))
        });
      }

      this.groups.set(groups);
    });
  }

  toggle(): void {
    this.collapsed.update((value) => !value);
  }
}
