import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-leadership',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leadership.component.html',
  styleUrl: './leadership.component.css'
})
export class LeadershipComponent implements OnInit {
  role: string | null = null;
  leader: any = null;

  leadersData: any = {
    ceo: {
      name: 'Eng. Zaid',
      title: 'Executive Chairman & Group CEO',
      image: 'assets/zaid_ceo.png',
      quote: "Markets reward execution, structure, and speed—not intention.",
      message: "At Confeet, we enable teams and enterprises to connect and operate with precision, compliance, and confidence. Our integrated model transforms complexity into clear, scalable communication foundations. We don't just simplify meetings—we structure them for success.",
      bio: "Zaid has over 20 years of experience in enterprise software. Before founding Confeet, he led global infrastructure teams at several Fortune 500 tech companies.",
      gradient: "linear-gradient(135deg, #1e3a8a, #0f172a)"
    },
    cto: {
      name: 'Eng. Istiyak',
      title: 'Chief Technology Officer',
      image: 'assets/istiyak_without_bg.png',
      quote: "Innovation isn't about the newest tech, it's about solving real human problems.",
      message: "We built Confeet's architecture on a foundation of zero-trust security and low-latency global edge networks. Our RAG AI assistant isn't a gimmick; it's deeply integrated into the media stream to ensure every document shared becomes a source of instantaneous truth.",
      bio: "Istiyak holds a Ph.D. in Computer Science and specializes in distributed systems and AI. He pioneered the proprietary encryption algorithms that keep Confeet secure.",
      gradient: "linear-gradient(135deg, #064e3b, #0f172a)"
    },
    cfo: {
      name: 'Amtul Lubna',
      title: 'Chief Operation Officer',
      image: 'assets/lubna_coo.png',
      quote: "Sustainable growth requires discipline and a relentless focus on value delivery.",
      message: "In an era of economic uncertainty, Confeet provides organizations with massive ROI by consolidating video, chat, and AI tools into one secure platform. Our financial stability allows us to invest heavily in long-term R&D rather than short-term gains.",
      bio: "Amtul Lubna brings decades of operation leadership from the telecom and SaaS sectors, driving Confeet's strategy for sustainable global expansion.",
      gradient: "linear-gradient(135deg, #701a75, #0f172a)"
    }
  };

  constructor(private route: ActivatedRoute, private router: Router) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.role = params.get('role');
      if (this.role && this.leadersData[this.role]) {
        this.leader = this.leadersData[this.role];
      } else {
        // Fallback to home if invalid role
        this.router.navigate(['/home']);
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }
}
