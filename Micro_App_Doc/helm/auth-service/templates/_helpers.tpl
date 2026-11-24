{{- define "auth-service.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "auth-service.selectorLabels" -}}
app.kubernetes.io/name: auth-service
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "auth-service.labels" -}}
{{ include "auth-service.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
environment: {{ .Values.environment | default "unknown" | quote }}
{{- end }}
