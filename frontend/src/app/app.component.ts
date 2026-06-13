import { Component } from '@angular/core';
import { ConverterComponent } from './components/converter/converter.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ConverterComponent],
  template: '<app-converter />'
})
export class AppComponent {}
