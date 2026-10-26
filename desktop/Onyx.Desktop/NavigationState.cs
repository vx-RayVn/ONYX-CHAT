namespace Onyx.Desktop;

// A completion from an older or cancelled navigation must never cover a healthy document.
internal sealed class NavigationState
{
    public ulong Current { get; private set; }
    public bool Ready { get; private set; }
    public int Retries { get; private set; }
    public void Start(ulong id) => Current = id;
    public bool Complete(ulong id, bool success, bool cancelled)
    {
        if (id != Current || cancelled) return false;
        if (success) { Ready = true; Retries = 0; }
        return !success;
    }
    public int NextRetryDelay() => Retries < 3 ? (1 << Retries++) * 1000 : 0;
    public void ProcessExited() { Ready = false; }
}
