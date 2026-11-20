/* Shared behaviour for every page: the mobile menu, the footer year and
   the enquiry forms. */

/* Enquiry forms don't send anything themselves. They write the enquiry
   into an email in the visitor's own email app, addressed to us, ready
   for them to send. */
const ENQUIRY_EMAIL = "info@mdjconsultantsltd.co.uk";
const ENQUIRY_PHONE = { href: "tel:+447713697615", text: "07713 697615" };

document.addEventListener("DOMContentLoaded", function () {
  setUpMenu();
  setYear();
  document.querySelectorAll("form[data-enquiry]").forEach(setUpEnquiryForm);
  setUpSplash();
});

function setUpSplash() {
  const splash = document.getElementById("splash");
  const enter = document.getElementById("splash-enter");
  if (!splash || !enter) return;

  enter.addEventListener("click", function () {
    splash.classList.add("splash-hidden");
    // Allow the transition to finish, then remove from tab order / focus
    setTimeout(function () {
      splash.setAttribute("aria-hidden", "true");
    }, 700);
  });

  // Also allow Enter key when the button is focused
  enter.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      enter.click();
    }
  });
}

function setUpMenu() {
  const nav = document.querySelector(".nav");
  const toggle = nav && nav.querySelector(".nav-toggle");
  if (!toggle) return;

  function setOpen(open) {
    nav.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "Close" : "Menu";
  }

  toggle.addEventListener("click", function () {
    setOpen(!nav.classList.contains("nav-open"));
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && nav.classList.contains("nav-open")) {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener("click", function (event) {
    if (nav.classList.contains("nav-open") && !nav.contains(event.target)) setOpen(false);
  });
  window.matchMedia("(min-width: 901px)").addEventListener("change", function (query) {
    if (query.matches) setOpen(false);
  });
}

function setYear() {
  const year = String(new Date().getFullYear());
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = year;
  });
}

// Turns the form into an email: a subject line and one "Label: value" line
// per field, with the longer message at the end.
function composeEnquiry(form) {
  const topicField = form.elements.topic;
  const topic = topicField ? topicField.value : "Website enquiry";
  const nameField = form.elements.name;
  const name = nameField ? nameField.value.trim() : "";
  const subject = "Website enquiry: " + topic + (name ? " – " + name : "");

  const lines = [];
  let message = "";
  Array.prototype.forEach.call(form.elements, function (field) {
    if (!field.name || field.type === "hidden" || field.type === "submit" || field.type === "button") return;
    const label = form.querySelector('label[for="' + field.id + '"]');
    const labelText = label ? label.textContent.trim() : field.name;
    const value = field.value.trim();
    if (field.tagName === "TEXTAREA") {
      message = value.replace(/\r?\n/g, "\r\n");
      return;
    }
    if (value) lines.push(labelText + ": " + value);
  });

  let body = lines.join("\r\n");
  if (message) body += "\r\n\r\n" + message;
  return { subject: subject, body: body };
}

function setUpEnquiryForm(form) {
  const status = document.createElement("div");
  status.className = "form-status";
  status.setAttribute("role", "status");
  status.hidden = true;
  form.appendChild(status);

  function link(href, text) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    return a;
  }

  function showOpened(email) {
    const intro = document.createElement("p");
    intro.textContent = "Your email app should now open with your enquiry filled in. Press send there to reach us.";

    const fallback = document.createElement("p");
    fallback.append(
      "If nothing opened, copy your enquiry and email it to ",
      link("mailto:" + ENQUIRY_EMAIL, ENQUIRY_EMAIL),
      ", or call ",
      link(ENQUIRY_PHONE.href, ENQUIRY_PHONE.text),
      "."
    );

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn btn-ghost form-copy";
    copy.textContent = "Copy enquiry";
    copy.addEventListener("click", function () {
      const text = "To: " + ENQUIRY_EMAIL + "\r\nSubject: " + email.subject + "\r\n\r\n" + email.body;
      copyText(text).then(function () {
        copy.textContent = "Copied";
      }, function () {
        copy.textContent = "Couldn't copy – please select the text in the form";
      });
    });

    status.replaceChildren(intro, fallback, copy);
    status.className = "form-status form-status-info";
    status.hidden = false;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const email = composeEnquiry(form);
    window.location.href = "mailto:" + ENQUIRY_EMAIL +
      "?subject=" + encodeURIComponent(email.subject) +
      "&body=" + encodeURIComponent(email.body);
    showOpened(email);
  });
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
  }
  return legacyCopy(text);
}

function legacyCopy(text) {
  return new Promise(function (resolve, reject) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (ok) resolve();
    else reject(new Error("copy failed"));
  });
}
