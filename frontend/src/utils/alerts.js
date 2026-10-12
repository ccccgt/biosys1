import Swal from "sweetalert2";

/* =========================================
   ALERTA DE ÉXITO
========================================= */
export function alertSuccess(message = "Operación realizada correctamente") {
  return Swal.fire({
    icon: "success",
    title: "Éxito",
    text: message,
    confirmButtonColor: "#0f172a",
  });
}

/* =========================================
   ALERTA DE ERROR
========================================= */
export function alertError(message = "Ocurrió un error") {
  return Swal.fire({
    icon: "error",
    title: "Error",
    text: message,
    confirmButtonColor: "#dc2626",
  });
}

/* =========================================
   ALERTA DE INFORMACIÓN
========================================= */
export function alertInfo(message) {
  return Swal.fire({
    icon: "info",
    title: "Información",
    text: message,
    confirmButtonColor: "#0f172a",
  });
}

/* =========================================
   CONFIRMACIÓN
========================================= */
export function alertConfirm(message = "¿Desea continuar?") {
  return Swal.fire({
    icon: "warning",
    title: "Confirmación",
    text: message,
    showCancelButton: true,
    confirmButtonText: "Sí",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#64748b",
  });
}

/* =========================================
   TOAST SUPERIOR
========================================= */
export function alertToast(message) {
  return Swal.fire({
    toast: true,
    position: "top-end",
    icon: "success",
    title: message,
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
  }); 
}

