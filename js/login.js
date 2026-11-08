const loginForm = document.getElementById("loginForm");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const togglePassword = document.getElementById("togglePassword");

const rememberMe = document.getElementById("rememberMe");
const forgotPassword = document.getElementById("forgotPassword");

const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");

const formFeedback = document.getElementById("formFeedback");
const signupForm = document.getElementById("signupForm");
const signupNameInput = document.getElementById("signupName");
const signupEmailInput = document.getElementById("signupEmail");
const signupPasswordInput = document.getElementById("signupPassword");
const signupFeedback = document.getElementById("signupFeedback");
const signupSubmit = document.getElementById("signupSubmit");

function setAuthMode(mode) {
    const isSignup = mode === "signup";
    loginForm.hidden = isSignup;
    signupForm.hidden = !isSignup;
    document.getElementById("showLoginRow").hidden = !isSignup;
    document.querySelector(".auth-switch:not(.signup-switch)").hidden = isSignup;
    document.querySelector(".form-driver").hidden = isSignup;
    document.querySelector(".system-note").hidden = isSignup;

    document.querySelector(".form-heading .welcom-lable").textContent =
        isSignup ? "TẠO TÀI KHOẢN" : "WELCOME BACK";
    document.querySelector(".form-heading h2").textContent =
        isSignup ? "Đăng ký tài khoản" : "Chào mừng trở lại!";
    document.querySelector(".form-heading p").textContent =
        isSignup
            ? "Tạo tài khoản để tham gia không gian làm việc của ban Multimedia."
            : "Đăng nhập vào không gian làm việc của ban Multimedia";
}

document.getElementById("showSignup").addEventListener("click", () => {
    setAuthMode("signup");
    signupNameInput.focus();
});

document.getElementById("showLogin").addEventListener("click", () => {
    setAuthMode("login");
    emailInput.focus();
});

document.getElementById("toggleSignupPassword").addEventListener("click", event => {
    const button = event.currentTarget;
    const isHidden = signupPasswordInput.type === "password";
    signupPasswordInput.type = isHidden ? "text" : "password";
    button.textContent = isHidden ? "Ẩn" : "Hiện";
});


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

  const submitButton = loginForm.querySelector('[type="submit"]');
  submitButton.disabled = true;

  try {
    const { error } = await window.supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    window.location.href = "dashboard.html";
  } catch (error) {
    console.error("Đăng nhập thất bại:", error);
    formFeedback.textContent = "Đăng nhập thất bại: " + error.message;
    formFeedback.style.color = "#dc2626";
  } finally {
    submitButton.disabled = false;
  }
});

signupForm.addEventListener("submit", async event => {
    event.preventDefault();
    signupFeedback.textContent = "";
    signupFeedback.style.color = "#555";

    const fullName = signupNameInput.value.trim();
    const email = signupEmailInput.value.trim();
    const password = signupPasswordInput.value;
    if (!fullName) {
        signupFeedback.style.color = "#dc2626";
        signupFeedback.textContent = "Vui lòng nhập họ và tên.";
        signupNameInput.focus();
        return;
    }

    if (!email || password.length < 8) return;

    signupSubmit.disabled = true;
    signupSubmit.textContent = "Đang tạo tài khoản...";

    try {
        const { data, error } = await window.supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    signup_source: "self_signup"
                }
            }
        });

        if (error) throw error;

        signupFeedback.style.color = "#15803d";
        signupFeedback.textContent = data.session
            ? "Tạo tài khoản thành công và đã liên kết với hồ sơ thành viên, vai trò Trưởng nhóm."
            : "Đã tạo tài khoản và liên kết với hồ sơ thành viên, vai trò Trưởng nhóm. Hãy kiểm tra email để xác nhận.";
        signupForm.reset();
    } catch (error) {
        console.error("Đăng ký thất bại:", error);
        signupFeedback.style.color = "#dc2626";
        signupFeedback.textContent = "Đăng ký thất bại: " + error.message;
    } finally {
        signupSubmit.disabled = false;
        signupSubmit.textContent = "Tạo tài khoản";
    }
});


forgotPassword.addEventListener("click", async function () {
    const email = emailInput.value.trim();
    emailError.textContent = "";
    formFeedback.textContent = "";

    if (!email || !validateEmail(email)) {
        emailError.textContent = "Nhập email hợp lệ để nhận liên kết đặt lại mật khẩu.";
        emailInput.focus();
        return;
    }

    const client = window.supabaseClient;
    if (!client?.auth) {
        formFeedback.textContent = "Không kết nối được Supabase. Vui lòng tải lại trang.";
        formFeedback.style.color = "#dc2626";
        return;
    }

    forgotPassword.disabled = true;
    forgotPassword.textContent = "Đang gửi...";
    formFeedback.textContent = "Đang gửi email khôi phục...";
    formFeedback.style.color = "#555";

    try {
        const redirectTo = new URL("reset-password.html", window.location.href).toString();
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;

        formFeedback.textContent =
            "Nếu email có tài khoản, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.";
        formFeedback.style.color = "#15803d";
    } catch (error) {
        console.error("Không thể gửi email đặt lại mật khẩu:", error);
        formFeedback.textContent = `Không gửi được email khôi phục: ${error.message}`;
        formFeedback.style.color = "#dc2626";
    } finally {
        forgotPassword.disabled = false;
        forgotPassword.textContent = "Quên mật khẩu?";
    }
});


emailInput.addEventListener("input", function () {

    emailError.textContent = "";
    formFeedback.textContent = "";

});

passwordInput.addEventListener("input", function () {

    passwordError.textContent = "";
    formFeedback.textContent = "";

});
