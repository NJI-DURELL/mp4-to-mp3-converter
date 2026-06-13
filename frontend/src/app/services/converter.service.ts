import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type Quality = 'ultra' | 'high' | 'medium' | 'low';

export interface ConvertResponse {
  jobId: string;
  outputFilename: string;
}

@Injectable({ providedIn: 'root' })
export class ConverterService {
  private readonly apiBase = environment.apiUrl;

  constructor(private http: HttpClient) {}

  convert(file: File, quality: Quality): Observable<ConvertResponse> {
    const form = new FormData();
    form.append('video', file);
    form.append('quality', quality);
    return this.http.post<ConvertResponse>(`${this.apiBase}/convert`, form);
  }

  watchProgress(jobId: string): EventSource {
    return new EventSource(`${this.apiBase}/progress/${jobId}`);
  }

  getDownloadUrl(filename: string): string {
    return `${this.apiBase}/download/${filename}`;
  }
}
