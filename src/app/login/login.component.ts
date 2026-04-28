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
  constructor(
    private nav: iNavigation,
    private httpService: HttpService
  ) { }

  ngOnInit(): void {
    const storedCreds = localStorage.getItem('creds');
    if (storedCreds) {
      const { email, password } = JSON.parse(storedCreds);
      this.email = email;
      this.password = password;
      this.rememberMe = true;
    }
  }
  login() {
    this.isSubmitted = true;
    if (!this.email || !this.isEmailValid)
      return;

    if (!this.password)
      return;

    this.isLoading = true;
    let user = {
      email: this.email,
      password: this.password
    }
    this.httpService.login("auth/authenticateUser", user).then((res: any) => {
      if (res.ResponseBody) {
        this.isLoading = false;
        if (this.rememberMe) {
          localStorage.setItem('creds', JSON.stringify({ email: this.email, password: this.password }));
        } else {
          localStorage.removeItem('creds');
        }
        this.nav.navigate(ChatPage, null);
      }
    }).catch(e => {
      this.isLoading = false;
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
