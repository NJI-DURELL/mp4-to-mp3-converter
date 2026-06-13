import {
  Component, ElementRef, OnDestroy, ViewChild, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ConverterService, Quality } from '../../services/converter.service';

type State = 'idle' | 'uploading' | 'converting' | 'done' | 'error';

interface QualityOption {
  value: Quality;
  label: string;
  desc: string;
  bitrate: string;
  icon: string;
}

@Component({
  selector: 'app-converter',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './converter.component.html',
  styleUrls: ['./converter.component.scss']
})
export class ConverterComponent implements OnDestroy {
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('dropZone') dropZoneRef!: ElementRef<HTMLDivElement>;

  state: State = 'idle';
  isDragging = false;
  selectedFile: File | null = null;
  selectedQuality: Quality = 'ultra';
  progress = 0;
  timemark = '';
  errorMessage = '';
  downloadUrl = '';
  outputFilename = '';
  jobId = '';

  private sse: EventSource | null = null;

  qualities: QualityOption[] = [
    { value: 'ultra',  label: 'Ultra',  desc: 'Studio Quality', bitrate: '320 kbps', icon: '◈' },
    { value: 'high',   label: 'High',   desc: 'Premium Audio',  bitrate: '256 kbps', icon: '◆' },
    { value: 'medium', label: 'Medium', desc: 'Balanced',       bitrate: '192 kbps', icon: '◇' },
    { value: 'low',    label: 'Low',    desc: 'Compact',        bitrate: '128 kbps', icon: '○' }
  ];

  constructor(private converterService: ConverterService) {}

  @HostListener('dragover', ['$event'])
  onWindowDragOver(e: DragEvent) { e.preventDefault(); }

  @HostListener('drop', ['$event'])
  onWindowDrop(e: DragEvent) { e.preventDefault(); }

  onDragEnter(e: DragEvent) {
    e.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(e: DragEvent) {
    e.preventDefault();
    const zone = this.dropZoneRef?.nativeElement;
    if (zone && !zone.contains(e.relatedTarget as Node)) {
      this.isDragging = false;
    }
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragging = false;
    const file = e.dataTransfer?.files[0];
    if (file) this.handleFile(file);
  }

  onFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) this.handleFile(input.files[0]);
  }

  handleFile(file: File) {
    const videoExts = ['mp4','mkv','avi','mov','wmv','flv','webm'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!videoExts.includes(ext)) {
      this.errorMessage = 'Please upload a video file (MP4, MKV, AVI, MOV, WMV, FLV, WebM)';
      this.state = 'error';
      return;
    }
    this.selectedFile = file;
    this.state = 'idle';
    this.errorMessage = '';
    this.progress = 0;
  }

  triggerFileInput() {
    this.fileInputRef.nativeElement.click();
  }

  get fileSizeMB(): string {
    if (!this.selectedFile) return '';
    return (this.selectedFile.size / (1024 * 1024)).toFixed(1);
  }

  convert() {
    if (!this.selectedFile) return;
    this.state = 'uploading';
    this.progress = 0;
    this.errorMessage = '';

    this.converterService.convert(this.selectedFile, this.selectedQuality).subscribe({
      next: (res) => {
        this.jobId = res.jobId;
        this.outputFilename = res.outputFilename;
        this.state = 'converting';
        this.listenToProgress(res.jobId);
      },
      error: (err) => {
        this.state = 'error';
        this.errorMessage = err?.error?.error || 'Upload failed. Please try again.';
      }
    });
  }

  listenToProgress(jobId: string) {
    this.sse?.close();
    this.sse = this.converterService.watchProgress(jobId);

    this.sse.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'progress') {
        this.progress = Math.min(data.percent, 99);
        this.timemark = data.timemark || '';
      } else if (data.type === 'done') {
        this.progress = 100;
        this.state = 'done';
        this.downloadUrl = this.converterService.getDownloadUrl(data.filename);
        this.sse?.close();
      } else if (data.type === 'error') {
        this.state = 'error';
        this.errorMessage = data.message || 'Conversion failed.';
        this.sse?.close();
      }
    };

    this.sse.onerror = () => {
      if (this.state !== 'done' && this.state !== 'error') {
        this.state = 'error';
        this.errorMessage = 'Connection lost during conversion.';
      }
      this.sse?.close();
    };
  }

  reset() {
    this.sse?.close();
    this.state = 'idle';
    this.selectedFile = null;
    this.progress = 0;
    this.timemark = '';
    this.errorMessage = '';
    this.downloadUrl = '';
    this.outputFilename = '';
    this.jobId = '';
    if (this.fileInputRef) this.fileInputRef.nativeElement.value = '';
  }

  get selectedQualityObj(): QualityOption {
    return this.qualities.find(q => q.value === this.selectedQuality)!;
  }

  isState(s: string): boolean {
    return (this.state as string) === s;
  }

  ngOnDestroy() {
    this.sse?.close();
  }
}
