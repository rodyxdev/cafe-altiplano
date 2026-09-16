/**
 * Café Altiplano — login del panel (admin/index.html)
 *
 * El servidor responde con una cookie httpOnly; aquí no se guarda ni se toca
 * ningún token, solo se redirige al panel cuando la respuesta es correcta.
 */
(function () {
  'use strict';

  var formulario = document.getElementById('form-login');
  var boton = document.getElementById('btn-entrar');
  var error = document.getElementById('error-login');
  var enviando = false;

  function mostrarError(mensaje) {
    error.textContent = mensaje;
    error.classList.remove('oculto');
  }

  // Si ya hay sesión viva, no tiene caso pedir credenciales otra vez.
  fetch('/api/admin/session', { credentials: 'same-origin' })
    .then(function (res) { if (res.ok) window.location.replace('/admin/panel.html'); })
    .catch(function () { /* sin sesión: se queda en el formulario */ });

  formulario.addEventListener('submit', function (e) {
    e.preventDefault();
    if (enviando) return;

    error.classList.add('oculto');
    enviando = true;
    boton.disabled = true;
    boton.textContent = 'Entrando...';

    fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: formulario.elements.username.value,
        password: formulario.elements.password.value
      })
    })
      .then(function (res) {
        return res.json().then(function (cuerpo) {
          return { estado: res.status, cuerpo: cuerpo };
        });
      })
      .then(function (r) {
        if (r.estado === 200 && r.cuerpo.ok) {
          window.location.replace('/admin/panel.html');
          return;
        }
        var mensaje = (r.cuerpo && r.cuerpo.error) || 'No pudimos iniciar sesión.';
        if (r.cuerpo && typeof r.cuerpo.intentosRestantes === 'number') {
          mensaje += ' Te quedan ' + r.cuerpo.intentosRestantes +
            ' intento' + (r.cuerpo.intentosRestantes === 1 ? '' : 's') + '.';
        }
        mostrarError(mensaje);
        formulario.elements.password.value = '';
      })
      .catch(function (err) {
        console.error('[login]', err);
        mostrarError('No pudimos conectar con el servidor.');
      })
      .then(function () {
        enviando = false;
        boton.disabled = false;
        boton.textContent = 'Entrar';
      });
  });
})();
