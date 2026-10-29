_Use: Look into the person's Docker containers and Kubernetes clusters: read the container, pod, log
or manifest they attach to a message from the DevOps workbench, and run `docker` and `kubectl`
yourself to look further or to change anything. Use when a container, pod, deployment, service or
node is attached or open in a DevOps tab, or when they ask about a container or a cluster._

# Work with containers and clusters

DevOps gives you no tools. The workbench is the person's window onto the Docker daemon and the
cluster; you reach the same things through what they attach to a message and through your own shell
(`docker`, `kubectl`) when those CLIs are installed.

## What arrives with a message

The person attaches a resource by dragging a row from the workbench sidebar into the message box,
by picking it in the message box's `@` menu (Docker, Kubernetes), or by leaving a container, pod,
deployment, service or node tab open, which offers what it shows as a chip they can dismiss. The
text comes to you between `--- Context …` and `--- End context ---` lines. What each holds:

- **Container:** name, state, image, status, ports, creation time. Opened on a view: Logs (last 400
  lines), Stats (CPU, memory, network and block I/O, PIDs) or Processes (`docker top`); the last
  two exist only while it runs. **Image, volume, network:** identity and metadata only.
- **Pod:** phase, readiness, restarts, node, IP, containers. Its views: Logs (last 400 lines, of the
  chosen container or of its `previous` run), Describe, Events, Manifest (YAML). **Deployment,
  service:** describe, events, manifest. **Node:** describe, manifest.
- **Context or namespace:** the namespaces, or the pods with phase, readiness and restarts.

A tab open on Logs attaches the logs the person is looking at, for the container selected there.

## What the attachment is not

- **A moment, not the present.** It was read when the message was sent; later turns keep that copy.
  For how things are now, run `docker ps`, `docker logs`, `kubectl get`, `kubectl describe`.
- **Not always there.** An attachment over about 8 KB is dropped whole, not cut, and so is one that
  looks like it holds a credential. A 400-line log is often over. You then get one line,
  `@resource:<link>: not included — … Read it with your tools`. Read it yourself
  (`docker logs --tail 400 <name>`, `kubectl logs --tail=400 …`), taking the container and
  `--previous` from the link when it names them (`…/logs/container/<c>[/previous]`). Do not repeat a
  token or password you find in a log or manifest.
- **Not named by context.** A pod's logs, events and manifest do not say which kubeconfig context it
  belongs to; only the pod summary and the link do. The workbench picks a context per request and
  never changes kubeconfig's `current-context`, so `kubectl` without `--context` may be another
  cluster. Pass `--context` and `-n`; if you cannot tell the context, ask. A context reading
  `current` means none was recorded and the workbench most likely cannot read it: use kubectl's own.
- **Docker's endpoint** comes from `DOCKER_HOST`, then the Docker context, as it does for the CLI.

## Looking, then changing

Reading is free: `docker ps -a`, `inspect`, `logs`, `stats --no-stream`; `kubectl get`, `describe`,
`logs`, `get events`, `top`. Start there and quote what you found.

Before you change anything, say what you will run and on what (container, namespace, context). The
workbench asks first for each of these, and you do the same:

- `docker rm`, `rmi`, `prune`: a prune takes every stopped container, dangling image, unused volume
  (its data is lost) or unused network, and cannot be undone. Do not force-remove an image or a
  volume (`-f`) to get past a refusal: the workbench never does, and Docker refuses while a
  container uses it.
- Stopping or restarting a whole Compose project, and `docker compose up -d` (it may recreate or
  pull).
- `kubectl delete pod`: a controller recreates a managed pod, a bare pod is gone for good, so check
  which it is. A rollout restart recreates the pods batch by batch.
- Node `cordon` keeps new pods off and is reversible; `drain` evicts every pod and loses `emptyDir`
  data. Cordon first and drain only when asked.

The shell flags `docker … rm|rmi|prune` and `kubectl … delete|drain` as dangerous commands and may
ask the person itself; that is a safety net, not your confirmation. A change shows in the open
workbench on its own (it follows `docker events` and a live watch), so do not ask for a refresh.
