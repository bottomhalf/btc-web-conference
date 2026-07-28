import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { iNavigation } from '../providers/services/iNavigation';
import { HttpService } from '../providers/services/http.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent implements OnInit {
  registerForm!: FormGroup;
  isSubmitted: boolean = false;
  isLoading: boolean = false;

  constructor(
    private fb: FormBuilder,
    private nav: iNavigation,
    private httpService: HttpService
  ) { }

  ngOnInit(): void {
    this.registerForm = this.fb.group({
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      mobile: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]]
    });
  }

  goBack() {
    this.nav.navigate('login', null);
  }

  register() {
    this.isSubmitted = true;
    if (this.registerForm.invalid) {
      return;
    }

    this.isLoading = true;
    const user = this.registerForm.value;

    this.httpService.post("user/register", user).then((res: any) => {
      this.isLoading = false;
      if (res.httpStatusCode == 200 || res.httpStatusCode == 201) {
        alert("Registration successful. Check your email for login details.");
      } else {
        alert(res.message || "Registration failed. Please try again.");
      }
    }).catch(e => {
      this.isLoading = false;
      alert("Registration failed. Please try again.");
    });
  }
}
