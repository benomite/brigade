// The waiting-list form (#3271): checks the email, posts it to the form's data-endpoint and says what happened.
(function () {
  var form = document.getElementById("cloud-form");
  if (!form) return;
  var msg = document.getElementById("cloud-message");
  var input = document.getElementById("cloud-email");
  var EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = input.value.trim();
    if (!EMAIL.test(email)) { msg.textContent = "Please enter a valid email address."; input.focus(); return; }
    var url = form.getAttribute("data-endpoint");
    if (!url) { msg.textContent = "The signup is not open yet."; return; }
    msg.textContent = "Sending…";
    fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email }) })
      .then(function (r) {
        if (r.ok) { msg.textContent = "Thank you: we will write to you once."; form.reset(); }
        else msg.textContent = r.status === 400 ? "Please enter a valid email address." : "Something went wrong. Please try again later.";
      })
      .catch(function () { msg.textContent = "Something went wrong. Please try again later."; });
  });
})();
