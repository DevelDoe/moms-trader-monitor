// mtp_collector.c
#include <json-c/json.h>
#include <libwebsockets.h>
#include <signal.h>
#include <stdatomic.h>
#include <stdio.h>
#include <string.h>
#include <windows.h>

// ─────────────────────────────────────────────
// 🔧 CONFIGURATION
// ─────────────────────────────────────────────
#define PIPE_NAME "\\\\.\\pipe\\mtp_pipe"
#define CLIENT_ID "CLIENT"
#define WS_HOST "172.232.155.62"
#define WS_PORT 8000
#define WS_PATH "/ws"
#define WS_PROTOCOL "mtp-protocol"
#define DEBUG 1

// ─────────────────────────────────────────────
// 🧩 STRUCTS
// ─────────────────────────────────────────────
typedef struct {
  HANDLE pipe;
  struct lws_context *context;
  struct lws *wsi;
} AppState;

// ─────────────────────────────────────────────
// 🔮 PROTOTYPES
// ─────────────────────────────────────────────
int init_named_pipe(AppState *state);
void connect_websocket(AppState *state);
void main_loop(AppState *state);
void write_json_to_pipe(HANDLE pipe, const char *json);

static int ws_callback(struct lws *wsi, enum lws_callback_reasons reason,
                       void *user, void *in, size_t len);

void handle_shutdown(int sig);

// ─────────────────────────────────────────────
// 🌍 GLOBALS
// ─────────────────────────────────────────────
static struct lws_protocols protocols[] = {{WS_PROTOCOL, ws_callback, 0, 4096},
                                           {NULL, NULL, 0, 0}};

static AppState app = {0};
volatile int running = 1;
static struct lws_sorted_usec_list sul_reconnect;
static char client_id[64] = {0}; // Global

// ─────────────────────────────────────────────
// 🏁 MAIN ENTRY
// ─────────────────────────────────────────────
int main(void) {
  signal(SIGINT, handle_shutdown); // ✅ Set shutdown handlers early
  signal(SIGTERM, handle_shutdown);

  if (!init_named_pipe(&app))
    return 1;

  connect_websocket(&app);

  main_loop(&app); // <-- now handles interrupts cleanly

  CloseHandle(app.pipe);
  lws_context_destroy(app.context);

  return 0;
}

// ─────────────────────────────────────────────
// 📡 WEBSOCKET LOGIC
// ─────────────────────────────────────────────

void reconnect_websocket(struct lws_sorted_usec_list *sul) {
  fprintf(stderr, "🔁 Reconnecting WebSocket...\n");

  if (app.context) {
    lws_context_destroy(app.context); // ✅ Destroy previous context
    app.context = NULL;
  }

  connect_websocket(&app);
}

void connect_websocket(AppState *state) {
  struct lws_context_creation_info info = {0};
  info.port = CONTEXT_PORT_NO_LISTEN;
  info.protocols = protocols;

  state->context = lws_create_context(&info);
  if (!state->context) {
    fprintf(stderr, "❌ Failed to create WS context\n");
    exit(1);
  }

  struct lws_client_connect_info conn = {0};
  conn.context = state->context;
  conn.address = WS_HOST;
  conn.port = WS_PORT;
  conn.path = WS_PATH;
  conn.host = conn.address;
  conn.origin = conn.address;
  conn.protocol = WS_PROTOCOL;

  state->wsi = lws_client_connect_via_info(&conn);
  if (!state->wsi) {
    fprintf(stderr, "❌ WebSocket connection failed\n");
    CloseHandle(state->pipe); // Cleanup before exit
    exit(1);
  }
}

int ws_callback(struct lws *wsi, enum lws_callback_reasons reason, void *user,
                void *in, size_t len) {
  switch (reason) {
  case LWS_CALLBACK_CLIENT_ESTABLISHED:
    if (DEBUG)
      printf("✅ WS connected\n");
    lws_callback_on_writable(wsi);
    break;

  case LWS_CALLBACK_CLIENT_RECEIVE: {
    char *text = (char *)in;
    if (len >= 4096) {
      fprintf(stderr, "⚠️ Oversized message\n");
      break;
    }
    text[len] = '\0';
    text[len < 4095 ? len : 4095] = '\0'; // Avoid writing out of bounds

    struct json_object *obj = json_tokener_parse(text);
    if (!obj)
      break;

    struct json_object *type;
    if (json_object_object_get_ex(obj, "type", &type)) {
      const char *t = json_object_get_string(type);

      if (strcmp(t, "welcome") == 0) {
        struct json_object *id_obj;
        if (json_object_object_get_ex(obj, "client_id", &id_obj)) {
          const char *id = json_object_get_string(id_obj);
          snprintf(client_id, sizeof(client_id), "%s", id);
          printf("🎉 Assigned client_id: %s\n", client_id);
        }
      }

      if (strcmp(t, "ping") == 0) {
        if (strlen(client_id) == 0) {
          printf("⚠️ Can't respond to ping — client_id not assigned yet\n");
          break;
        }

        char pong_msg[128];
        snprintf(pong_msg, sizeof(pong_msg),
                 "{\"type\":\"pong\",\"client_id\":\"%s\"}", client_id);

        unsigned char buf[LWS_PRE + 128];
        int len = snprintf((char *)buf + LWS_PRE, 128, "%s", pong_msg);
        lws_write(wsi, buf + LWS_PRE, len, LWS_WRITE_TEXT);
        printf("🔁 Responded with pong as %s\n", client_id);
      }

      if (strcmp(t, "alert") == 0 || strcmp(t, "symbol_update") == 0) {
        const char *json_str = json_object_to_json_string(obj);
        write_json_to_pipe(app.pipe, json_str);
      }
    }

    json_object_put(obj);
    break;
  }

  case LWS_CALLBACK_CLIENT_WRITEABLE: {
    const char *msg = "{\"type\":\"register\",\"role\":\"client\"}";
    unsigned char buf[LWS_PRE + 256];
    int len = snprintf((char *)buf + LWS_PRE, 256, "%s", msg);
    lws_write(wsi, buf + LWS_PRE, len, LWS_WRITE_TEXT);
    break;
  }

  case LWS_CALLBACK_CLIENT_CONNECTION_ERROR:
  case LWS_CALLBACK_CLOSED:
    fprintf(stderr, "⚠️ WebSocket disconnected, reconnecting...\n");
    lws_sul_schedule(app.context, 0, &sul_reconnect, reconnect_websocket,
                     3 * LWS_US_PER_SEC);

    break;

  default:
    break;
  }

  return 0;
}

void main_loop(AppState *state) {
  while (running) {
    lws_service(state->context, 0);
  }
}

// ─────────────────────────────────────────────
// 🧱 PIPE HELPERS
// ─────────────────────────────────────────────
int init_named_pipe(AppState *state) {
  while (1) {
    state->pipe =
        CreateNamedPipeA(PIPE_NAME, PIPE_ACCESS_OUTBOUND,
                         PIPE_TYPE_BYTE | PIPE_WAIT, 1, 4096, 4096, 0, NULL);

    if (state->pipe == INVALID_HANDLE_VALUE) {
      fprintf(stderr, "❌ CreateNamedPipe failed: %lu\n", GetLastError());
      Sleep(3000); // wait 3 seconds and retry
      continue;
    }

    printf("📡 Waiting for pipe reader...\n");

    BOOL connected = ConnectNamedPipe(state->pipe, NULL) ||
                     GetLastError() == ERROR_PIPE_CONNECTED;

    if (!connected) {
      fprintf(stderr, "⚠️ Pipe connect failed: %lu — retrying...\n",
              GetLastError());
      CloseHandle(state->pipe);
      Sleep(3000);
      continue;
    }

    printf("✅ Pipe connected\n");
    return 1;
  }
}

void write_json_to_pipe(HANDLE pipe, const char *json) {
  if (pipe == INVALID_HANDLE_VALUE || json == NULL) {
    fprintf(stderr, "⚠️ Pipe not valid, skipping write\n");
    return;
  }

  DWORD written;
  BOOL success = WriteFile(pipe, json, strlen(json), &written, NULL);
  if (!success) {
    fprintf(stderr, "⚠️ Pipe write failed: %lu\n", GetLastError());
    return;
  }
  WriteFile(pipe, "\n", 1, &written, NULL);
}

// ─────────────────────────────────────────────
//  Shut Down
// ─────────────────────────────────────────────

void handle_shutdown(int sig) {
  printf("⚠️ Caught signal %d, shutting down...\n", sig);
  running = 0;
  lws_cancel_service(app.context); // interrupt lws_service()
}
