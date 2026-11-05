const loginForm = document.getElementById("loginForm");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const togglePassword = document.getElementById("togglePassword");

const rememberMe = document.getElementById("rememberMe");
const forgotPassword = document.getElementById("forgotPassword");

const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");

const formFeedback = document.getElementById("formFeedback");


togglePassword.addEventListener("click", function () {

    if (passwordInput.type === "password") {

        passwordInput.type = "text";

        togglePassword.textContent = "Ẩn";

    } else {

        passwordInput.type = "password";

        togglePassword.textContent = "Hiện";
    }

});

function validateEmail(email) {

    const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailPattern.test(email);
}

function validatePassword(password) {

    return password.trim().length > 0;
}


function clearErrors() {

    emailError.textContent = "";
    passwordError.textContent = "";

    formFeedback.textContent = "";
}


window.addEventListener("DOMContentLoaded", function () {

    const savedEmail = localStorage.getItem("mediatask_email");

    if (savedEmail) {

        emailInput.value = savedEmail;

        rememberMe.checked = true;
    }

});


loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearErrors();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    formFeedback.textContent = "Nhập email và mật khẩu nhé.";
    formFeedback.style.color = "#dc2626";
    return;
  }

  formFeedback.textContent = "Đang đăng nhập...";
  formFeedback.style.color = "#555";

  const { error } = await window.supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    formFeedback.textContent = "Đăng nhập thất bại: " + error.message;
    formFeedback.style.color = "#dc2626";
    return;
  }

  window.location.href = "task-list.html";
});


forgotPassword.addEventListener("click", function () {

    alert(
        "Vui lòng liên hệ quản trị viên của ban Multimedia để được hỗ trợ đặt lại mật khẩu."
    );

});


emailInput.addEventListener("input", function () {

    emailError.textContent = "";
    formFeedback.textContent = "";

});

passwordInput.addEventListener("input", function () {

    passwordError.textContent = "";
    formFeedback.textContent = "";

});
