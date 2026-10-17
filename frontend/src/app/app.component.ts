import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, TooltipModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'ServisesVI';
  readonly collapsed = signal(false);

  readonly navItems: NavItem[] = [
    { path: '/', label: 'Скрипты', icon: 'pi pi-list', exact: true },
    { path: '/history', label: 'История', icon: 'pi pi-history' },
    { path: '/cookies', label: 'Cookies', icon: 'pi pi-key' }
  ];

  toggle(): void {
    this.collapsed.update((value) => !value);
  }
}
