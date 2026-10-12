import Swal from "sweetalert2";

export async function swalError(message, title = "Error") {
  return Swal.fire({
    icon: "error",
    title,
    text: message || "Ocurrió un error",
    confirmButtonText: "Aceptar",
  });
}

export async function swalSuccess(message, title = "Éxito") {
  return Swal.fire({
    icon: "success",
    title,
    text: message || "Operación realizada correctamente",
    confirmButtonText: "Aceptar",
  });
}

export async function swalWarning(message, title = "Aviso") {
  return Swal.fire({
    icon: "warning",
    title,
    text: message || "Revisa la información",
    confirmButtonText: "Aceptar",
  });
}

export async function swalConfirm({
  title = "¿Estás seguro?",
  text = "Esta acción no se puede deshacer.",
  confirmButtonText = "Sí",
  cancelButtonText = "Cancelar",
  icon = "question",
} = {}) {
  const res = await Swal.fire({
    icon,
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
  });

  return res.isConfirmed;
}