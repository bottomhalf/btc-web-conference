import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { iNavigation } from '../providers/services/iNavigation';
import { HttpService } from '../providers/services/http.service';
import { ChatPage } from '../models/constant';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  email: string = "";
  isSubmitted: boolean = false;
  isEmailValid: boolean = true;
  passwordType: string = "password";
  password: string = '';
  isLoading: boolean = false;
  rememberMe: boolean = false;
  errorMessage: string = '';

  constructor(
    private nav: iNavigation,
    private httpService: HttpService
  ) { }

  ngOnInit(): void {
    const storedCreds = localStorage.getItem('creds');
    if (storedCreds) {
      try {
        const { email, password } = JSON.parse(storedCreds);
        this.email = email || "";
        this.password = password || "";
        this.rememberMe = true;
      } catch (e) {
        localStorage.removeItem('creds');
      }
    }
  }

  goBack() {
    this.nav.navigate('home', null);
  }

  goToRegister() {
    this.nav.navigate('register', null);
  }

  loginWithGoogle() {
    alert("Google sign-in is coming soon!");
  }

  forgotPassword() {
    alert("Password reset feature is coming soon! Please contact your administrator.");
  }

  onInputChange() {
    if (this.errorMessage) {
      this.errorMessage = '';
    }
  }

  login() {
    this.errorMessage = '';
    this.isSubmitted = true;
    this.isValidEmail();

    if (!this.email || !this.isEmailValid)
      return;

    if (!this.password)
      return;

    this.isLoading = true;
    let user = {
      email: this.email,
      password: this.password
    }
    this.httpService.login("auth/v1/authenticateUser", user).then((res: any) => {
      this.isLoading = false;
      if (res.httpStatusCode == 200) {
        if (this.rememberMe) {
          localStorage.setItem('creds', JSON.stringify({ email: this.email, password: this.password }));
        } else {
          localStorage.removeItem('creds');
        }
        this.nav.navigate(ChatPage, null);
      } else {
        this.errorMessage = res.message || "Invalid email or password. Please try again.";
      }
    }).catch(e => {
      this.isLoading = false;
      this.errorMessage = e?.error?.message || e?.message || "Login failed. Please check your credentials.";
    })
  }

  isValidEmail() {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    this.isEmailValid = regex.test(this.email);
  }

  viewPassword() {
    if (this.passwordType == 'password')
      this.passwordType = "text";
    else
      this.passwordType = "password";
  }
}
